import {Scrubber} from '@heroku/js-blanket'
import childProcess from 'node:child_process'

import type {KeychainAuthEntry} from '../lib/types.js'

class InvalidCredentialValueError extends Error {}

interface SecretToolResult {
  error?: Error
  signal?: NodeJS.Signals | null
  status: null | number
  stderr?: Buffer | null | string
}

/**
 * Handles credential storage, removal, and retrieval using the Linux Secret Service API.
 * Uses the secret-tool command-line utility (part of libsecret) to interact with desktop keyrings.
 */
export class LinuxHandler {
  private readonly scrubber = new Scrubber({
    patterns: [
      /account\s+"[^"]*"/g,  // Scrub account value
    ],
  })

  /**
   * Retrieves the authentication token from the Linux keyring.
   * @param account - The account login to use (e.g. 'test@example.com')
   * @param service - The service name to use
   * @returns The stored authentication token.
   * @throws Error if the token is not found or retrieval fails.
   */
  public getAuth(account: string, service: string): string {
    try {
      this.validateValue(account, 'Account')
      this.validateValue(service, 'Service')

      const spawnResult = childProcess.spawnSync(
        'secret-tool',
        ['lookup', '--', 'service', service, 'account', account],
        {encoding: 'utf8'},
      )

      this.throwOnFailure(spawnResult, status => `exit ${status ?? -1}`)

      const token = spawnResult.stdout.trim()

      if (!token) {
        throw new Error('Token not found')
      }

      return token
    } catch (error) {
      const {message} = error as Error
      if (error instanceof InvalidCredentialValueError) {
        throw new TypeError(`Failed to retrieve token from Linux keyring: ${message}`)
      }

      throw new Error(`Failed to retrieve token from Linux keyring: ${this.scrubError(message, [account, service])}`)
    }
  }

  /**
   * Lists all accounts stored in the Linux keyring for a given service.
   * @param service - The service name to search for
   * @returns Array of account names found for the service
   * @throws Error if the search operation fails
   */
  public listAccounts(service: string): string[] {
    try {
      this.validateValue(service, 'Service')

      const spawnResult = childProcess.spawnSync(
        'secret-tool',
        ['search', '--all', '--', 'service', service],
        {encoding: 'utf8'},
      )

      this.throwOnFailure(spawnResult, () => 'Unknown error')

      /*
       * Expected output format:
       * stdout: label, secret, created, modified, schema lines
       * stderr: attribute.service / attribute.account lines
       */

      const accounts: string[] = []
      const lines = (spawnResult.stderr ?? '').split('\n')

      for (const line of lines) {
        const match = line.trim().match(/^attribute\.account\s*=\s*(.+)$/)
        if (match) {
          const account = match[1].trim()
          if (account) {
            accounts.push(account)
          }
        }
      }

      return accounts
    } catch (error) {
      const {message} = error as Error
      if (error instanceof InvalidCredentialValueError) {
        throw new TypeError(`Failed to list accounts in Linux keyring: ${message}`)
      }

      throw new Error(`Failed to list accounts in Linux keyring: ${this.scrubError(message, [service])}`)
    }
  }

  /**
   * Removes the authentication token from the Linux keyring.
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
        'secret-tool',
        ['clear', '--', 'service', service, 'account', account],
        {encoding: 'utf8', env: {...process.env, LC_ALL: 'C'}},
      )

      if (this.isMissingSecretClearFailure(spawnResult)) {
        return
      }

      this.throwOnFailure(spawnResult, status => `exit ${status ?? -1}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (error instanceof InvalidCredentialValueError) {
        throw new TypeError(`Failed to remove token from Linux keyring: ${message}`)
      }

      throw new Error(`Failed to remove token from Linux keyring: ${this.scrubError(message, [account, service])}`)
    }
  }

  /**
   * Saves an authentication entry to the Linux keyring.
   * If a credential with the same attributes already exists, it is updated with the new token.
   * @param auth - The authentication entry containing account and token information to store.
   * @returns void
   * @throws Error if the save operation fails.
   */
  public saveAuth(auth: KeychainAuthEntry): void {
    try {
      this.validateValue(auth.account, 'Account')
      this.validateValue(auth.service, 'Service')
      this.validateValue(auth.token, 'Token')

      const spawnResult = childProcess.spawnSync(
        'secret-tool',
        [
          'store',
          '--label=Heroku CLI',
          '--',
          'service',
          auth.service,
          'account',
          auth.account,
        ],
        {
          encoding: 'utf8',
          input: auth.token,
        },
      )

      this.throwOnFailure(spawnResult, () => 'Unknown error')
    } catch (error) {
      const {message} = error as Error
      if (error instanceof InvalidCredentialValueError) {
        throw new TypeError(`Failed to store token in Linux keyring: ${message}`)
      }

      throw new Error(`Failed to store token in Linux keyring: ${this.scrubError(message, [auth.account, auth.service, auth.token])}`)
    }
  }

  /**
   * secret-tool clear fails when no matching credential exists; treat as successful no-op for logout.
   * @param result - The secret-tool process result
   * @returns Whether the failure means no matching credential exists
   */
  private isMissingSecretClearFailure(result: SecretToolResult): boolean {
    // secret-tool clear exits 1 with no output when nothing matched (locale-independent).
    return !result.error
      && !result.signal
      && result.status === 1
      && (result.stderr ?? '').toString() === ''
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

  private throwOnFailure(result: SecretToolResult, fallback: (status: null | number) => string): void {
    if (result.error) {
      throw result.error
    }

    if (result.signal) {
      throw new Error(`terminated by signal ${result.signal}`)
    }

    if (result.status !== 0) {
      throw new Error(result.stderr?.toString() || fallback(result.status))
    }
  }

  private validateValue(value: string, name: string): void {
    if (value.includes('\0')) {
      throw new InvalidCredentialValueError(`${name} must not contain NUL characters`)
    }
  }
}
