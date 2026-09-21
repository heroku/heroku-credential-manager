import debug from 'debug'

import type {AuthEntry, NetrcAuthEntry} from './lib/types.js'

import {LinuxHandler} from './credential-handlers/linux-handler.js'
import {MacOSHandler} from './credential-handlers/macos-handler.js'
import {NetrcHandler} from './credential-handlers/netrc-handler.js'
import {WindowsHandler} from './credential-handlers/windows-handler.js'
import {CredentialStore, getNativeCredentialStore, getStorageConfig} from './lib/credential-storage-selector.js'
import {NativeCredentialNotFoundError} from './native-credential-not-found-error.js'

const credDebug = debug('heroku-credential-manager')

const SERVICE_NAME = 'heroku-cli'

/**
 * Saves authentication credentials to the native credential store (if available) or .netrc file.
 *
 * @param account - User's account (email)
 * @param token - Authentication token
 * @param hosts - Hostname(s) for netrc storage (e.g., ['api.heroku.com'])
 * @param service - Service name (defaults to 'heroku-cli')
 * @returns Promise that resolves when credentials are saved
 */
export async function saveAuth(account: string, token: string, hosts: string[], service = SERVICE_NAME): Promise<void> {
  const config = getStorageConfig()
  const netrcHandler = new NetrcHandler()
  let nativeSuccess = false

  if (config.credentialStore) {
    try {
      const handler = getCredentialHandler(config.credentialStore)
      handler.saveAuth({account, service, token})
      nativeSuccess = true
    } catch {
      credDebug('native credential store failed during saveAuth; falling back to netrc')
    }
  }

  const shouldUseNetrc = config.useNetrc || !nativeSuccess
  if (shouldUseNetrc) {
    const netrcAuth: NetrcAuthEntry = {
      login: account,
      password: token,
    }
    await netrcHandler.saveAuthForHosts(netrcAuth, hosts)
  } else if (hosts.length > 0) {
    await netrcHandler.removeAuthForHosts(hosts, account)
  }
}

/**
 * Retrieves authentication credentials from the native credential store (if available) or .netrc file.
 *
 * @param account - User's account, or undefined to read the requested host directly from netrc
 * @param host - Hostname for netrc lookup (e.g., 'api.heroku.com')
 * @param service - Service name (defaults to 'heroku-cli')
 * @returns Promise that resolves with the authentication account and token.
 * @throws Error if no credentials are found in either location.
 */
export async function getAuth(account: string | undefined, host: string, service = SERVICE_NAME): Promise<AuthEntry> {
  const config = getStorageConfig()
  const netrcHandler = new NetrcHandler()

  if (config.credentialStore && account) {
    try {
      const handler = getCredentialHandler(config.credentialStore)
      const token = handler.getAuth(account, service)
      return {account, token}
    } catch (error) {
      if (!(error instanceof NativeCredentialNotFoundError)) throw error
      credDebug('native credential was not found during getAuth; falling back to netrc')
    }
  }

  const auth = await netrcHandler.getAuth(host)

  if (auth.login && auth.password) {
    if (account && auth.login !== account) {
      throw new Error('Netrc credential does not match the requested account for host')
    }

    return {account: auth.login, token: auth.password}
  }

  throw new Error('No auth found')
}

/**
 * Lists all accounts stored in the native credential store for a given service.
 *
 * @param service - Service name (defaults to 'heroku-cli')
 * @returns Array of account names, or an empty array if native storage is unavailable or enumeration fails
 */
export async function listKeychainAccounts(service = SERVICE_NAME): Promise<string[]> {
  const config = getStorageConfig()

  if (config.credentialStore) {
    try {
      const handler = getCredentialHandler(config.credentialStore)
      return handler.listAccounts(service)
    } catch {
      credDebug('native credential store failed during listKeychainAccounts')
    }
  }

  return []
}

/**
 * Removes authentication credentials from the platform native store (when present) and .netrc.
 * Always attempts to remove from both stores to remove stale tokens when users switch between modes.
 *
 * @param account - User's account (email), or undefined when native removal should be skipped
 * @param hosts - Hostname(s) for netrc storage (e.g., ['api.heroku.com'])
 * @param service - Service name (defaults to 'heroku-cli')
 * @param expectedToken - Optional token that existing credentials must exactly match
 * @returns Promise that resolves when credentials are removed
 */
export async function removeAuth(
  account: string | undefined,
  hosts: string[],
  service = SERVICE_NAME,
  expectedToken?: string,
): Promise<void> {
  const netrcHandler = new NetrcHandler()
  const nativeStore = getNativeCredentialStore()

  if (nativeStore && account) {
    try {
      const handler = getCredentialHandler(nativeStore)
      if (expectedToken === undefined || handler.getAuth(account, service) === expectedToken) {
        handler.removeAuth(account, service)
      }
    } catch (error) {
      if (!(error instanceof NativeCredentialNotFoundError)) {
        credDebug('native credential store failed during removeAuth; continuing netrc cleanup')
      }
    }
  }

  if (hosts.length > 0) {
    await netrcHandler.removeAuthForHosts(hosts, account, expectedToken)
  }
}

/**
 * Factory function to create the appropriate credential handler based on platform.
 * @private
 * @param store - The type of credential store to use
 * @returns A handler instance for the specified store
 */
export function getCredentialHandler(store: CredentialStore) {
  switch (store) {
    case CredentialStore.LinuxSecretService: {
      return new LinuxHandler()
    }

    case CredentialStore.MacOSKeychain: {
      return new MacOSHandler()
    }

    case CredentialStore.WindowsCredentialManager: {
      return new WindowsHandler()
    }
  }
}

export {LinuxHandler} from './credential-handlers/linux-handler.js'
export {MacOSHandler} from './credential-handlers/macos-handler.js'
export {NetrcHandler} from './credential-handlers/netrc-handler.js'
export {WindowsHandler} from './credential-handlers/windows-handler.js'
export {CredentialStore, getNativeCredentialStore, getStorageConfig} from './lib/credential-storage-selector.js'
export type {StorageConfig} from './lib/credential-storage-selector.js'
export {deleteLoginState, readLoginState, writeLoginState} from './lib/login-state.js'
export {Netrc, parse} from './lib/netrc-parser.js'
export type {
  Machines,
  MachinesWithTokens,
  MachineToken,
  Token,
} from './lib/netrc-parser.js'
export type {AuthEntry, KeychainAuthEntry, NetrcAuthEntry} from './lib/types.js'
export {NativeCredentialNotFoundError} from './native-credential-not-found-error.js'
