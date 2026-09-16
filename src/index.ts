import debug from 'debug'

import type {AuthEntry, NetrcAuthEntry} from './lib/types.js'

import {LinuxHandler} from './credential-handlers/linux-handler.js'
import {MacOSHandler} from './credential-handlers/macos-handler.js'
import {NetrcHandler} from './credential-handlers/netrc-handler.js'
import {WindowsHandler} from './credential-handlers/windows-handler.js'
import {CredentialStore, getNativeCredentialStore, getStorageConfig} from './lib/credential-storage-selector.js'
import {NativeCredentialNotFoundError} from './native-credential-not-found-error.js'
import {
  NetrcPostCommitError, type NetrcPostCommitOperation, isNetrcPostCommitError,
} from './netrc-post-commit-error.js'

const credDebug = debug('heroku-credential-manager')

const SERVICE_NAME = 'heroku-cli'

function errorProperty(error: unknown, property: 'cause' | 'message'): unknown {
  try {
    return (error as Record<'cause' | 'message', unknown>)[property]
  } catch {
    return undefined
  }
}

function aggregateErrors(error: AggregateError): undefined | unknown[] {
  try {
    return [...error.errors as Iterable<unknown>]
  } catch {
    return undefined
  }
}

function collectNetrcPostCommitErrors(
  error: unknown,
  markers: Set<object>,
  linksByError: Map<object, unknown[]>,
  visited = new Set<object>(),
): void {
  if ((typeof error !== 'object' && typeof error !== 'function') || error === null || visited.has(error)) return
  visited.add(error)

  if (isNetrcPostCommitError(error)) markers.add(error)
  const links: unknown[] = []
  if (error instanceof AggregateError) {
    links.push(...(aggregateErrors(error) ?? []))
  }

  if (error instanceof Error || markers.has(error)) links.push(errorProperty(error, 'cause'))
  linksByError.set(error, links)
  for (const link of links) {
    collectNetrcPostCommitErrors(link, markers, linksByError, visited)
  }
}

function errorsContainingNetrcPostCommitErrors(
  markers: Set<object>,
  linksByError: Map<object, unknown[]>,
): Set<object> {
  const markedErrors = new Set(markers)
  let changed = true
  while (changed) {
    changed = false
    for (const [error, links] of linksByError) {
      if (markedErrors.has(error)) continue
      const containsMarker = links.some(link => markedErrors.has(link as object))
      if (containsMarker) {
        markedErrors.add(error)
        changed = true
      }
    }
  }

  return markedErrors
}

type ContextualizationContext = {
  markedErrors: Set<object>
  markers: Set<object>
  operation: NetrcPostCommitOperation
  projected: Map<object, unknown>
}

function contextualizedNetrcError(
  error: unknown,
  context: ContextualizationContext,
): unknown {
  const {markedErrors, markers, operation, projected} = context
  if ((typeof error === 'object' || typeof error === 'function') && error !== null && projected.has(error)) {
    return projected.get(error)
  }

  if (markers.has(error as object)) {
    const message = errorProperty(error, 'message')
    const contextualized = new NetrcPostCommitError(
      typeof message === 'string' ? message : 'Netrc mutation committed but a subsequent operation failed',
      {operation},
    )
    projected.set(error as object, contextualized)
    Object.defineProperty(contextualized, 'cause', {
      configurable: true,
      value: contextualizedNetrcError(errorProperty(error, 'cause'), context),
      writable: true,
    })
    return contextualized
  }

  if (!markedErrors.has(error as object)) return error

  if (!(error instanceof AggregateError)) {
    const message = errorProperty(error, 'message')
    const contextualized = new Error(typeof message === 'string' ? message : 'Netrc operation failed')
    projected.set(error as object, contextualized)
    Object.defineProperty(contextualized, 'cause', {
      configurable: true,
      value: contextualizedNetrcError(errorProperty(error, 'cause'), context),
      writable: true,
    })
    return contextualized
  }

  const message = errorProperty(error, 'message')
  const contextualized = new AggregateError([], typeof message === 'string' ? message : 'Netrc operation failed')
  projected.set(error, contextualized)
  contextualized.errors = (aggregateErrors(error) ?? [])
    .map(child => contextualizedNetrcError(child, context))
  Object.defineProperty(contextualized, 'cause', {
    configurable: true,
    value: contextualizedNetrcError(errorProperty(error, 'cause'), context),
    writable: true,
  })
  return contextualized
}

function contextualizeNetrcPostCommitError(error: unknown, operation: NetrcPostCommitOperation): unknown {
  const markers = new Set<object>()
  const linksByError = new Map<object, unknown[]>()
  collectNetrcPostCommitErrors(error, markers, linksByError)
  if (markers.size === 0) return error
  return contextualizedNetrcError(error, {
    markedErrors: errorsContainingNetrcPostCommitErrors(markers, linksByError),
    markers,
    operation,
    projected: new Map<object, unknown>(),
  })
}

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
    try {
      await netrcHandler.saveAuthForHosts(netrcAuth, hosts)
    } catch (error) {
      throw contextualizeNetrcPostCommitError(error, 'save')
    }
  } else if (hosts.length > 0) {
    try {
      await netrcHandler.removeAuthForHosts(hosts, account)
    } catch (error) {
      throw contextualizeNetrcPostCommitError(error, 'stale-cleanup')
    }
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
 * @throws The native or netrc error after both cleanups are attempted. If both fail, throws an AggregateError whose
 * errors are ordered native first and netrc second.
 */
export async function removeAuth(
  account: string | undefined,
  hosts: string[],
  service = SERVICE_NAME,
  expectedToken?: string,
): Promise<void> {
  const netrcHandler = new NetrcHandler()
  const nativeStore = getNativeCredentialStore()
  let nativeError: unknown
  let nativeFailed = false
  let netrcError: unknown
  let netrcFailed = false

  if (nativeStore && account) {
    try {
      const handler = getCredentialHandler(nativeStore)
      if (expectedToken === undefined || handler.getAuth(account, service) === expectedToken) {
        handler.removeAuth(account, service)
      }
    } catch (error) {
      if (!(error instanceof NativeCredentialNotFoundError)) {
        credDebug('native credential store failed during removeAuth; continuing netrc cleanup')
        nativeFailed = true
        nativeError = error
      }
    }
  }

  if (hosts.length > 0) {
    try {
      await netrcHandler.removeAuthForHosts(hosts, account, expectedToken)
    } catch (error) {
      netrcFailed = true
      netrcError = contextualizeNetrcPostCommitError(error, 'remove')
    }
  }

  if (nativeFailed && netrcFailed) {
    throw new AggregateError(
      [nativeError, netrcError],
      'Failed to remove credentials from native storage and netrc',
    )
  }

  if (nativeFailed) throw nativeError
  if (netrcFailed) throw netrcError
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
  MachineToken,
  Machines,
  MachinesWithTokens,
  Token,
} from './lib/netrc-parser.js'
export type {AuthEntry, KeychainAuthEntry, NetrcAuthEntry} from './lib/types.js'
export {NativeCredentialNotFoundError} from './native-credential-not-found-error.js'
export {NetrcPostCommitError, isNetrcPostCommitError} from './netrc-post-commit-error.js'
export type {NetrcPostCommitOperation} from './netrc-post-commit-error.js'
