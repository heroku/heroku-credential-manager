import {Scrubber} from '@heroku/js-blanket'
import childProcess from 'node:child_process'

import {KeychainAuthEntry} from '../lib/types.js'

const SERVICE_NAME = 'heroku-cli'

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
   * @param service - The service name to use (default 'heroku-cli')
   * @returns The stored authentication token.
   * @throws Error if the token is not found or retrieval fails.
   */
  public getAuth(account: string, service = SERVICE_NAME): string {
    try {
      const output = childProcess.execSync(
        `secret-tool lookup service "${service}" account "${account}"`,
      )
      const token = output.toString().trim()

      if (!token) {
        throw new Error('Token not found')
      }

      return token
    } catch (error) {
      const {message} = error as Error
      throw new Error(`Failed to retrieve token from Linux keyring: ${this.scrubError(message)}`)
    }
  }

  /**
   * Removes the authentication token from the Linux keyring.
   * @param account - The account login to use (e.g. 'test@example.com')
   * @param service - The service name to use (default 'heroku-cli')
   * @returns void
   * @throws Error if the removal operation fails.
   */
  public removeAuth(account: string, service = SERVICE_NAME): void {
    try {
      childProcess.execSync(
        `secret-tool clear service "${service}" account "${account}"`,
      )
    } catch (error) {
      const {message} = error as Error
      throw new Error(`Failed to remove token from Linux keyring: ${this.scrubError(message)}`)
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
      const process = childProcess.spawnSync(
        'secret-tool',
        [
          'store',
          '--label=Heroku CLI',
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

      if (process.error) {
        throw process.error
      }

      if (process.status !== 0) {
        const stderr = process.stderr?.toString() || 'Unknown error'
        throw new Error(stderr)
      }
    } catch (error) {
      const {message} = error as Error
      throw new Error(`Failed to store token in Linux keyring: ${this.scrubError(message)}`)
    }
  }

  /**
   * Scrubs account names and passwords/tokens from error messages.
   *
   * @param message - The error message to scrub
   * @returns The scrubbed error message with sensitive data replaced by "[SCRUBBED]"
   */
  private scrubError(message: string): string {
    const result = this.scrubber.scrub({message})
    return result.data.message
  }
}
