import {Scrubber} from '@heroku/js-blanket'
import childProcess from 'node:child_process'

import type {KeychainAuthEntry} from '../lib/types.js'

import {NativeCredentialNotFoundError} from '../native-credential-not-found-error.js'

class InvalidCredentialValueError extends Error {}

interface SecurityResult {
  error?: Error
  signal?: NodeJS.Signals | null
  status: null | number
  stderr?: Buffer | null | string
}

/**
 * Handles credential storage, removal, and retrieval using the macOS Keychain.
 * Uses the macOS security command-line tool to interact with the Keychain.
 */
export class MacOSHandler {
  private readonly scrubber = new Scrubber({
    patterns: [
      /-a\s+"[^"]*"/g, // Scrub account (-a flag)
      /-w\s+"[^"]*"/g, // Scrub password/token (-w flag)
    ],
  })

  /**
   * Retrieves the authentication token from macOS Keychain.
   * @param account - The account login to use (e.g. 'test@example.com')
   * @param service - The service name to use
   * @returns The stored authentication token.
   * @throws NativeCredentialNotFoundError if the token is not found; Error if retrieval fails.
   */
  public getAuth(account: string, service: string): string {
    try {
      this.validateValue(account, 'Account')
      this.validateValue(service, 'Service')

      const spawnResult = childProcess.spawnSync(
        'security',
        ['find-generic-password', '-a', account, '-s', service, '-w'],
        {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
      )

      this.throwOnFailure(spawnResult, [44])

      if (spawnResult.status === 44) {
        throw new NativeCredentialNotFoundError(spawnResult.stderr?.toString() || 'exit 44')
      }

      const token = spawnResult.stdout.trim()

      if (!token) {
        throw new NativeCredentialNotFoundError('Token not found')
      }

      return token
    } catch (error) {
      const {message} = error as Error
      if (error instanceof InvalidCredentialValueError) {
        throw new TypeError(`Failed to retrieve token from macOS Keychain: ${message}`)
      }

      const diagnostic = `Failed to retrieve token from macOS Keychain: ${this.scrubError(message, [account, service])}`
      if (error instanceof NativeCredentialNotFoundError) {
        throw new NativeCredentialNotFoundError(diagnostic)
      }

      throw new Error(diagnostic)
    }
  }

  /**
   * Lists all accounts stored in macOS Keychain for a given service.
   * @param service - The service name to search for
   * @returns Array of account names found for the service
   * @throws Error if the search operation fails
   */
  public listAccounts(service: string): string[] {
    try {
      this.validateValue(service, 'Service')

      const spawnResult = childProcess.spawnSync(
        'security',
        ['dump-keychain'],
        {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
      )

      this.throwOnFailure(spawnResult)

      const output = spawnResult.stdout

      // Expected output format:
      // keychain: "/path/to/keychain"
      // version: 512
      // class: "genp"
      // attributes:
      //     0x00000007 <blob>="service-name"
      //     "acct"<blob>="account-name"
      //     "svce"<blob>="service-name"
      //     ...

      const accounts: string[] = []

      // Split by keychain entry boundaries
      const entries = output.split(/^keychain:/m)

      for (const entry of entries) {
        // Only process generic password entries
        if (!entry.includes('class: "genp"')) continue

        // Extract service name
        const serviceMatch = entry.match(/"svce"<blob>="([^"]+)"/)
        if (!serviceMatch || serviceMatch[1] !== service) continue

        // Extract account name
        const accountMatch = entry.match(/"acct"<blob>="([^"]+)"/)
        if (accountMatch) {
          accounts.push(accountMatch[1])
        }
      }

      return accounts
    } catch (error) {
      const {message} = error as Error
      if (error instanceof InvalidCredentialValueError) {
        throw new TypeError(`Failed to list accounts in macOS Keychain: ${message}`)
      }

      throw new Error(`Failed to list accounts in macOS Keychain: ${this.scrubError(message, [service])}`)
    }
  }

  /**
   * Removes the authentication token from macOS Keychain.
   * @param account - The account login to use (e.g. 'test@example.com')
   * @param service - The service name to use
   * @returns void
   * @throws Error if the removal operation fails.
   */
  public removeAuth(account: string, service: string): void {
    try {
      this.validateValue(account, 'Account')
      this.validateValue(service, 'Service')

      const spawnResult = childProcess.spawnSync(
        'security',
        ['delete-generic-password', '-a', account, '-s', service],
        {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
      )

      // security exits 44 when the generic password does not exist (e.g. netrc-only login)
      this.throwOnFailure(spawnResult, [44])
    } catch (error) {
      const {message} = error as Error
      if (error instanceof InvalidCredentialValueError) {
        throw new TypeError(`Failed to remove token from macOS Keychain: ${message}`)
      }

      throw new Error(`Failed to remove token from macOS Keychain: ${this.scrubError(message, [account, service])}`)
    }
  }

  /**
   * Saves an authentication entry to macOS Keychain.
   * If a credential with the same name already exists, it is updated with the new token.
   * @param auth - The authentication entry containing account and token information to store.
   * @returns void
   * @throws Error if the save operation fails.
   */
  public saveAuth(auth: KeychainAuthEntry): void {
    try {
      this.validateValue(auth.account, 'Account')
      this.validateValue(auth.service, 'Service')
      this.validateValue(auth.token, 'Token')

      // security prompts through the controlling terminal when -w has no value, so the
      // non-interactive CLI requires the password argument despite its process-list exposure.
      const spawnResult = childProcess.spawnSync(
        'security',
        ['add-generic-password', '-U', '-a', auth.account, '-s', auth.service, '-w', auth.token],
        {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
      )

      this.throwOnFailure(spawnResult)
    } catch (error) {
      const {message} = error as Error
      if (error instanceof InvalidCredentialValueError) {
        throw new TypeError(`Failed to store token in macOS Keychain: ${message}`)
      }

      throw new Error(`Failed to store token in macOS Keychain: ${this.scrubError(message, [auth.account, auth.service, auth.token])}`)
    }
  }

  /**
   * Scrubs account names and passwords/tokens from error messages.
   *
   * @param message - The error message to scrub
   * @param values - Exact sensitive values to scrub
   * @returns The scrubbed error message with sensitive data replaced by "[SCRUBBED]"
   */
  private scrubError(message: string, values: string[] = []): string {
    let scrubbedMessage = message
    const sensitiveVariants = values.flatMap(value => {
      const normalized = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
      const crlfNormalized = normalized.replaceAll('\n', '\r\n')
      return [value, normalized, crlfNormalized].flatMap(variant => [variant, Buffer.from(variant, 'utf8').toString('base64')])
    }).filter(Boolean)

    for (const value of [...new Set(sensitiveVariants)].sort((left, right) => right.length - left.length)) {
      scrubbedMessage = scrubbedMessage.replaceAll(value, '[SCRUBBED]')
    }

    const result = this.scrubber.scrub({message: scrubbedMessage})
    return result.data.message
  }

  private throwOnFailure(result: SecurityResult, allowedStatuses: number[] = []): void {
    if (result.error) {
      throw result.error
    }

    if (result.signal) {
      throw new Error(`terminated by signal ${result.signal}`)
    }

    if (result.status !== 0 && !allowedStatuses.includes(result.status ?? -1)) {
      throw new Error(result.stderr?.toString() || `exit ${result.status ?? -1}`)
    }
  }

  private validateValue(value: string, name: string): void {
    if (value.includes('\0')) {
      throw new InvalidCredentialValueError(`${name} must not contain NUL characters`)
    }
  }
}
