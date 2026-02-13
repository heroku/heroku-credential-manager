import {Scrubber} from '@heroku/js-blanket'
import childProcess from 'node:child_process'

import {KeychainAuthEntry} from '../lib/types.js'

const SERVICE_NAME = 'heroku-cli'

/**
 * Handles credential storage, removal, and retrieval using the macOS Keychain.
 * Uses the macOS security command-line tool to interact with the Keychain.
 */
export class MacOSHandler {
  /**
   * Retrieves the authentication token from macOS Keychain.
   * @param account - The account login to use (e.g. 'test@example.com')
   * @param service - The service name to use (default 'heroku-cli')
   * @returns The stored authentication token.
   * @throws Error if the token is not found or retrieval fails.
   */
  public getAuth(account: string, service = SERVICE_NAME): string {
    try {
      const output = childProcess.execSync(
        `security find-generic-password -a "${account}" -s "${service}" -w`,
      )
      const token = output.toString().trim()

      if (!token) {
        throw new Error('Token not found')
      }

      return token
    } catch (error) {
      const {message} = error as Error
      throw new Error(`Failed to retrieve token from macOS Keychain: ${this.scrubError(message)}`)
    }
  }

  /**
   * Removes the authentication token from macOS Keychain.
   * @param account - The account login to use (e.g. 'test@example.com')
   * @param service - The service name to use (default 'heroku-cli')
   * @returns void
   * @throws Error if the removal operation fails.
   */
  public removeAuth(account: string, service = SERVICE_NAME): void {
    try {
      childProcess.execSync(
        `security delete-generic-password -a "${account}" -s "${service}"`,
      )
    } catch (error) {
      const {message} = error as Error
      throw new Error(`Failed to remove token from macOS Keychain: ${this.scrubError(message)}`)
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
      childProcess.execSync(
        `security add-generic-password -U -a "${auth.account}" -s "${auth.service}" -w "${auth.token}"`,
      )
    } catch (error) {
      const {message} = error as Error
      throw new Error(`Failed to store token in macOS Keychain: ${this.scrubError(message)}`)
    }
  }

  /**
   * Scrubs account names and passwords/tokens from error messages.
   *
   * @param message - The error message to scrub
   * @returns The scrubbed error message with sensitive data replaced by "[REDACTED]"
   */
  private scrubError(message: string): string {
    const scrubber = new Scrubber({
      patterns: [
        /-a\s+"[^"]*"/g, // Scrub account (-a flag)
        /-w\s+"[^"]*"/g, // Scrub password/token (-w flag)
      ],
    })
    const result = scrubber.scrub({message})
    return result.data.message
  }
}
