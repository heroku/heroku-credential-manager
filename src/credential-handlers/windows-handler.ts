import childProcess from 'node:child_process'

import type {KeychainAuthEntry} from '../lib/types.js'

import {NativeCredentialNotFoundError} from '../native-credential-not-found-error.js'

const missingCredentialExitCode = 3
const missingCredentialSentinel = 'HEROKU_CREDENTIAL_NOT_FOUND'

// Caller-provided values are decoded from the environment/stdin; this source must remain fixed.
const passwordVaultScript = `
$ErrorActionPreference = 'Stop'
[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]

$missingCredentialHResult = -2147023728 # 0x80070490 (ERROR_NOT_FOUND)
$missingCredentialExitCode = 3
$missingCredentialSentinel = 'HEROKU_CREDENTIAL_NOT_FOUND'

function ConvertFrom-HerokuBase64([string] $Value) {
  if ([string]::IsNullOrEmpty($Value)) { return '' }
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Value))
}

function ConvertTo-HerokuBase64([string] $Value) {
  return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Value))
}

function Test-HerokuMissingCredential([Exception] $Exception) {
  while ($null -ne $Exception) {
    if ($Exception.HResult -eq $missingCredentialHResult) { return $true }
    $Exception = $Exception.InnerException
  }

  return $false
}

$operation = $env:HEROKU_CREDENTIAL_OPERATION
$service = ConvertFrom-HerokuBase64 $env:HEROKU_CREDENTIAL_SERVICE
$account = ConvertFrom-HerokuBase64 $env:HEROKU_CREDENTIAL_ACCOUNT
$vault = New-Object Windows.Security.Credentials.PasswordVault

switch ($operation) {
  'get' {
    try {
      $credential = $vault.Retrieve($service, $account)
    } catch {
      if (Test-HerokuMissingCredential $_.Exception) {
        [Console]::Error.WriteLine($missingCredentialSentinel)
        exit $missingCredentialExitCode
      } else {
        throw
      }
    }
    $credential.RetrievePassword()
    ConvertTo-HerokuBase64 $credential.Password
  }
  'list' {
    try {
      $credentials = $vault.FindAllByResource($service)
    } catch {
      if (Test-HerokuMissingCredential $_.Exception) {
        [Console]::Error.WriteLine($missingCredentialSentinel)
        exit $missingCredentialExitCode
      } else {
        throw
      }
    }
    $credentials | ForEach-Object { ConvertTo-HerokuBase64 $_.UserName }
  }
  'remove' {
    try {
      $credential = $vault.Retrieve($service, $account)
    } catch {
      if (Test-HerokuMissingCredential $_.Exception) {
        [Console]::Error.WriteLine($missingCredentialSentinel)
        exit $missingCredentialExitCode
      } else {
        throw
      }
    }
    $vault.Remove($credential)
  }
  'save' {
    try {
      $credential = $vault.Retrieve($service, $account)
      $vault.Remove($credential)
    } catch {
      if (-not (Test-HerokuMissingCredential $_.Exception)) { throw }
    }
    $tokenBase64 = [Console]::In.ReadToEnd()
    $token = ConvertFrom-HerokuBase64 $tokenBase64
    $credential = New-Object Windows.Security.Credentials.PasswordCredential($service, $account, $token)
    $vault.Add($credential)
  }
  default { throw 'Unsupported credential operation' }
}
`

type PasswordVaultOperation = 'get' | 'list' | 'remove' | 'save'

interface PowerShellResult {
  error?: Error
  signal?: NodeJS.Signals | null
  status: null | number
  stderr?: Buffer | null | string
  stdout?: Buffer | null | string
}

/**
 * Handles credential storage and retrieval using the Windows Credential Manager.
 * Uses PowerShell commands to interact with the Windows.Security.Credentials.PasswordVault API.
 */
export class WindowsHandler {
  /**
   * Retrieves the authentication token from Windows Credential Manager.
   * @param account - The account login to use (e.g. 'test@example.com')
   * @param service - The service name to use
   * @returns The stored authentication token.
   * @throws NativeCredentialNotFoundError if the token is not found; Error if retrieval fails.
   */
  public getAuth(account: string, service: string): string {
    try {
      const result = this.invokePowerShell('get', service, account)
      if (this.isMissingCredential(result)) {
        throw new NativeCredentialNotFoundError(this.outputText(result.stderr).trim())
      }

      this.throwOnFailure(result)
      const token = this.decodeValue(this.outputText(result.stdout).trim())

      if (!token) {
        throw new NativeCredentialNotFoundError('Token not found')
      }

      return token
    } catch (error) {
      const diagnostic = `Failed to retrieve token from Windows Credential Manager: ${this.scrubError(error, [account, service])}`
      if (error instanceof NativeCredentialNotFoundError) {
        throw new NativeCredentialNotFoundError(diagnostic)
      }

      throw new Error(diagnostic)
    }
  }

  /**
   * Lists all accounts stored in Windows Credential Manager for a given service.
   * @param service - The service name to search for
   * @returns Array of account names found for the service
   * @throws Error if the search operation fails
   */
  public listAccounts(service: string): string[] {
    try {
      const result = this.invokePowerShell('list', service)
      if (this.isMissingCredential(result)) {
        return []
      }

      this.throwOnFailure(result)
      return this.outputText(result.stdout)
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => this.decodeValue(line))
    } catch (error) {
      throw new Error(`Failed to list accounts in Windows Credential Manager: ${this.scrubError(error, [service])}`)
    }
  }

  /**
   * Removes the authentication token from Windows Credential Manager.
   * @param account - The account login to use (e.g. 'test@example.com')
   * @param service - The service name to use
   * @returns void
   * @throws Error if the removal operation fails.
   */
  public removeAuth(account: string, service: string): void {
    try {
      const result = this.invokePowerShell('remove', service, account)
      if (this.isMissingCredential(result)) {
        return
      }

      this.throwOnFailure(result)
    } catch (error) {
      throw new Error(`Failed to remove token from Windows Credential Manager: ${this.scrubError(error, [account, service])}`)
    }
  }

  /**
   * Saves an authentication entry to Windows Credential Manager.
   * If a credential with the same name already exists, it is removed before saving the new one.
   * @param auth - The authentication entry containing account and token information to store.
   * @returns void
   * @throws Error if the save operation fails.
   */
  public saveAuth(auth: KeychainAuthEntry): void {
    try {
      const result = this.invokePowerShell('save', auth.service, auth.account, auth.token)
      this.throwOnFailure(result)
    } catch (error) {
      throw new Error(`Failed to store token in Windows Credential Manager: ${this.scrubError(error, [auth.account, auth.service, auth.token])}`)
    }
  }

  private decodeValue(value: string): string {
    return Buffer.from(value, 'base64').toString('utf8')
  }

  private encodeValue(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64')
  }

  private invokePowerShell(operation: PasswordVaultOperation, service: string, account = '', token = ''): PowerShellResult {
    this.validateValues([service, account, token])

    return childProcess.spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', passwordVaultScript],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          HEROKU_CREDENTIAL_ACCOUNT: this.encodeValue(account),
          HEROKU_CREDENTIAL_OPERATION: operation,
          HEROKU_CREDENTIAL_SERVICE: this.encodeValue(service),
        },
        input: token ? this.encodeValue(token) : '',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
  }

  private isMissingCredential(result: PowerShellResult): boolean {
    return !result.error
      && !result.signal
      && result.status === missingCredentialExitCode
      && this.outputText(result.stdout) === ''
      && new RegExp(`^${missingCredentialSentinel}(?:\\r?\\n)?$`).test(this.outputText(result.stderr))
  }

  private outputText(output: Buffer | null | string | undefined): string {
    return output?.toString() ?? ''
  }

  private scrubError(error: unknown, secrets: string[]): string {
    let message = error instanceof Error ? error.message : String(error)
    const values = secrets.flatMap(secret => {
      if (!secret) return []

      const normalizedValues = new Set([
        secret,
        secret.replaceAll(/\r\n?|\n/g, '\n'),
        secret.replaceAll(/\r\n?|\n/g, '\r\n'),
      ])

      return [...normalizedValues].flatMap(value => [value, this.encodeValue(value)])
    })

    for (const value of [...new Set(values)].sort((left, right) => right.length - left.length)) {
      message = message.split(value).join('[SCRUBBED]')
    }

    return message
  }

  private throwOnFailure(result: PowerShellResult): void {
    if (result.error) {
      throw result.error
    }

    if (result.signal) {
      throw new Error(`terminated by signal ${result.signal}`)
    }

    if (result.status !== 0) {
      const detail = this.outputText(result.stderr).trim() || `PowerShell exited with status ${result.status ?? 'unknown'}`
      throw new Error(detail)
    }
  }

  private validateValues(values: string[]): void {
    if (values.some(value => value.includes('\0'))) {
      throw new Error('Credential values must not contain NUL characters')
    }
  }
}
