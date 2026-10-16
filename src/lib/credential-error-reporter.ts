import type {CredentialStore} from './credential-storage-selector.js'

/**
 * The native-credential-store operations whose failures can be surfaced to a
 * registered reporter. These mirror the public credential functions exported
 * from the package root.
 */
export type CredentialErrorOperation = 'getAuth' | 'listKeychainAccounts' | 'removeAuth' | 'saveAuth'

export type CredentialErrorContext = {
  credentialStore: CredentialStore
  operation: CredentialErrorOperation
}

/**
 * A consumer-supplied hook invoked when a native credential store operation
 * fails. The package itself observes nothing; a host application (for example a
 * CLI) may register a reporter to surface these otherwise-internal failures to
 * wherever it collects diagnostics.
 */
export type CredentialErrorReporter = (error: unknown, context: CredentialErrorContext) => Promise<void> | void

let reporter: CredentialErrorReporter | undefined

/**
 * Register the process-wide reporter invoked on native credential store
 * failures, or pass `undefined` to clear it. Returns the previously registered
 * reporter so callers (and tests) can restore it.
 */
export function setCredentialErrorReporter(next: CredentialErrorReporter | undefined): CredentialErrorReporter | undefined {
  const previous = reporter
  reporter = next
  return previous
}

/**
 * Invoke the registered reporter, if any. Never throws and never rejects: a
 * failing reporter must not disrupt credential resolution, so its errors are
 * swallowed.
 */
export async function reportCredentialError(error: unknown, context: CredentialErrorContext): Promise<void> {
  if (!reporter) return
  try {
    await reporter(error, context)
  } catch {
    // A reporter failure must never propagate into credential resolution.
  }
}
