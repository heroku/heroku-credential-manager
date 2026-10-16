import type {CredentialStore} from './credential-storage-selector.js'

import {credDebug} from './debug.js'

/**
 * The native-credential-store operations whose failures can be surfaced to a
 * registered reporter. These mirror the public credential functions exported
 * from the package root.
 */
export type CredentialErrorOperation = 'getAuth' | 'listKeychainAccounts' | 'removeAuth' | 'saveAuth'

export type CredentialErrorContext = {
  readonly credentialStore: CredentialStore
  readonly operation: CredentialErrorOperation
}

/**
 * A consumer-supplied hook invoked when a native credential store operation
 * fails. The package itself observes nothing; a host application (for example a
 * CLI) may register a reporter to surface these otherwise-internal failures to
 * wherever it collects diagnostics.
 *
 * The return type is `void | PromiseLike<unknown>` rather than `Promise<void>`
 * so that any callback shape is accepted — a synchronous side-effect that
 * returns a value, or a promise of anything. The reporter is `await`ed on the
 * failure path (see {@link reportCredentialError}), so it MUST be non-blocking:
 * a reporter that hangs will stall credential resolution.
 */
export type CredentialErrorReporter = (error: unknown, context: CredentialErrorContext) => PromiseLike<unknown> | void

let reporter: CredentialErrorReporter | undefined

/**
 * Register the process-wide reporter invoked on native credential store
 * failures, or pass `undefined` to clear it. Returns the previously registered
 * reporter so callers (and tests) can restore it.
 *
 * This is intended for a single host application (such as a CLI), not for use
 * by libraries: the reporter is stored in module-level state, so a second
 * registration replaces the first (last writer wins). It is also scoped to one
 * module instance — if two copies of this package are loaded (for example an
 * unresolved duplicate in the dependency tree, or ESM/CJS dual loading), a
 * reporter registered against one instance will not observe failures routed
 * through the other.
 */
export function setCredentialErrorReporter(next: CredentialErrorReporter | undefined): CredentialErrorReporter | undefined {
  const previous = reporter
  reporter = next
  return previous
}

/**
 * Invoke the registered reporter, if any. Never throws and never rejects: a
 * failing reporter must not disrupt credential resolution, so its errors are
 * swallowed (and noted via debug logging, not re-raised).
 */
export async function reportCredentialError(error: unknown, context: CredentialErrorContext): Promise<void> {
  if (!reporter) return
  try {
    await reporter(error, context)
  } catch {
    // A reporter failure must never propagate into credential resolution.
    credDebug('credential error reporter threw during %s; ignoring', context.operation)
  }
}
