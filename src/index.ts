import debug from 'debug'

import {LinuxHandler} from './credential-handlers/linux-handler.js'
import {MacOSHandler} from './credential-handlers/macos-handler.js'
import {NetrcHandler} from './credential-handlers/netrc-handler.js'
import {WindowsHandler} from './credential-handlers/windows-handler.js'
import {selectAccount} from './lib/account-selector.js'
import {CredentialStore, getStorageConfig} from './lib/credential-storage-selector.js'
import {NetrcAuthEntry} from './lib/types.js'

const credDebug = debug('heroku-credential-manager')

const SERVICE_NAME = 'heroku-cli'

/**
 * Saves authentication credentials to the native credential store (if available) and .netrc file.
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

  if (config.credentialStore) {
    try {
      const handler = getCredentialHandler(config.credentialStore)
      handler.saveAuth({account, service, token})
    } catch (error) {
      const {message} = error as Error
      credDebug(message)
    }
  }

  if (config.useNetrc) {
    const netrcAuth: NetrcAuthEntry = {
      login: account,
      password: token,
    }
    for (const host of hosts) {
      // eslint-disable-next-line no-await-in-loop
      await netrcHandler.saveAuth(netrcAuth, host)
    }
  }
}

/**
 * Retrieves authentication credentials from the native credential store (if available) or .netrc file.
 *
 * @param account - User's account (email), or undefined to search for account
 * @param host - Hostname for netrc lookup (e.g., 'api.heroku.com')
 * @param service - Service name (defaults to 'heroku-cli')
 * @returns Promise that resolves with the authentication token.
 * @throws Error if no credentials are found in either location.
 */
export async function getAuth(account: string | undefined, host: string, service = SERVICE_NAME): Promise<string> {
  const config = getStorageConfig()
  const netrcHandler = new NetrcHandler()

  if (config.credentialStore) {
    try {
      const handler = getCredentialHandler(config.credentialStore)

      if (account) {
        return handler.getAuth(account, service)
      }

      const accounts = handler.listAccounts(service)
      const selectedAccount = await selectAccount(accounts)

      if (selectedAccount) {
        return handler.getAuth(selectedAccount, service)
      }

      config.useNetrc = true
    } catch (error) {
      const {message} = error as Error
      credDebug(message)
    }
  }

  if (config.useNetrc) {
    const auth = await netrcHandler.getAuth(host)

    if (!auth.password) {
      throw new Error('No credentials found. Please log in.')
    }

    return auth.password
  }

  throw new Error('No credentials found. Please log in.')
}

/**
 * Removes authentication credentials from the native credential store (if available) and .netrc file.
 *
 * @param account - User's account (email), or undefined to search for account
 * @param hosts - Hostname(s) for netrc storage (e.g., ['api.heroku.com'])
 * @param service - Service name (defaults to 'heroku-cli')
 * @returns Promise that resolves when credentials are removed
 */
export async function removeAuth(account: string | undefined, hosts: string[], service = SERVICE_NAME): Promise<void> {
  const config = getStorageConfig()
  const netrcHandler = new NetrcHandler()

  if (config.credentialStore) {
    try {
      const handler = getCredentialHandler(config.credentialStore)

      if (account) {
        handler.removeAuth(account, service)
      } else {
        const accounts = handler.listAccounts(service)
        const selectedAccount = await selectAccount(accounts)

        if (selectedAccount) {
          handler.removeAuth(selectedAccount, service)
        } else {
          config.useNetrc = true
        }
      }
    } catch (error) {
      const {message} = error as Error
      credDebug(message)
    }
  }

  if (config.useNetrc) {
    for (const host of hosts) {
      // eslint-disable-next-line no-await-in-loop
      await netrcHandler.removeAuth(host)
    }
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
  case CredentialStore.MacOSKeychain: {
    return new MacOSHandler()
  }

  case CredentialStore.WindowsCredentialManager: {
    return new WindowsHandler()
  }

  case CredentialStore.LinuxSecretService: {
    return new LinuxHandler()
  }
  }
}
