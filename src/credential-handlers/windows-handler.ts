import childProcess from 'node:child_process'

import {KeychainAuthEntry} from '../lib/types.js'

const SERVICE_NAME = 'heroku-cli'

/**
 * Handles credential storage and retrieval using the Windows Credential Manager.
 * Uses PowerShell commands to interact with the Windows.Security.Credentials.PasswordVault API.
 */
export class WindowsHandler {
  /**
   * Retrieves the authentication token from Windows Credential Manager.
   * @param account - The account login to use (e.g. 'test@example.com')
   * @param service - The service name to use (default 'heroku-cli')
   * @returns The stored authentication token.
   * @throws Error if the token is not found or retrieval fails.
   */
  public async getAuth(account: string, service = SERVICE_NAME) {
    try {
      const psCommand = `
      [void]
      [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]
      $vault = New-Object Windows.Security.Credentials.PasswordVault
      $credential = $vault.Retrieve("${service}", "${account}")
      $credential.Password
    `

      const output = childProcess.execSync(psCommand, {shell: 'powershell'})
      const token = output.toString().trim()

      if (!token) {
        throw new Error('Token not found')
      }

      return token
    } catch (error) {
      const {message} = error as Error
      throw new Error(`Failed to retrieve token from Windows Credential Manager: ${message}`)
    }
  }

  /**
   * Removes the authentication token from Windows Credential Manager.
   * @param account - The account login to use (e.g. 'test@example.com')
   * @param service - The service name to use (default 'heroku-cli')
   * @throws Error if the removal operation fails.
   * @returns A promise that resolves when the credentials are removed.
   */
  public async removeAuth(account: string, service = SERVICE_NAME) {
    try {
      const psCommand = `
      [void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]
      $vault = New-Object Windows.Security.Credentials.PasswordVault
      $credential = $vault.Retrieve("${service}", "${account}")
      $vault.Remove($credential)
    `
      childProcess.execSync(psCommand, {shell: 'powershell'})
    } catch (error) {
      const {message} = error as Error
      throw new Error(`Failed to remove token from Windows Credential Manager: ${message}`)
    }
  }

  /**
   * Saves an authentication entry to Windows Credential Manager.
   * If a credential with the same name already exists, it is removed before saving the new one.
   * @param auth - The authentication entry containing account and token information to store.
   * @returns A promise that resolves when the credentials are saved.
   * @throws Error if the save operation fails.
   */
  public async saveAuth(auth: KeychainAuthEntry) {
    try {
      try {
        const removeCommand = `
        [void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]
        $vault = New-Object Windows.Security.Credentials.PasswordVault
        $credential = $vault.Retrieve("${auth.service}", "${auth.account}")
        $vault.Remove($credential)
      `
        childProcess.execSync(removeCommand, {shell: 'powershell'})
      } catch {
        // noop - item does not exist
      }

      const addCommand = `
      [void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]
      $vault = New-Object Windows.Security.Credentials.PasswordVault
      $credential = New-Object Windows.Security.Credentials.PasswordCredential("${auth.service}", "${auth.account}", "${auth.token}")
      $vault.Add($credential)
    `
      childProcess.execSync(addCommand, {shell: 'powershell'})
    } catch (error) {
      const {message} = error as Error
      throw new Error(`Failed to store token in Windows Credential Manager: ${message}`)
    }
  }
}
