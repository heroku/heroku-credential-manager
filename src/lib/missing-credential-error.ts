import {NativeCredentialNotFoundError} from '../native-credential-not-found-error.js'

/**
 * Thrown when a requested credential simply does not exist in any store, rather
 * than a genuine failure worth surfacing. Prefer throwing this over a plain
 * `Error` so callers can detect a miss by type (via
 * {@link isMissingCredentialError}) instead of by matching message strings.
 */
export class MissingCredentialError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'MissingCredentialError'
  }
}

/**
 * True when `error` indicates the requested credential simply does not exist in
 * any store (native keychain or netrc), rather than a genuine failure worth
 * surfacing. Hosts use this to tell "not logged in yet" apart from an error to
 * report.
 *
 * Recognizes the typed {@link MissingCredentialError} and
 * {@link NativeCredentialNotFoundError} directly. As a legacy fallback it also
 * matches the historical "not found" message strings, so plain `Error`s
 * constructed elsewhere (for example by an older consumer) are still classified
 * correctly:
 *
 * - `No auth found` / `No auth found for <host>`
 * - `Netrc credential does not match the requested account for host`
 *
 * Note: the `No auth found for <host>` fallback is a prefix match across all
 * hosts, which is broader than a host-exact match. The only internal producer
 * (the netrc handler) always uses the requested host, so this is safe; new
 * callers should throw {@link MissingCredentialError} and not rely on the
 * string fallback.
 */
export function isMissingCredentialError(error: unknown): boolean {
  if (error instanceof MissingCredentialError) return true
  if (error instanceof NativeCredentialNotFoundError) return true
  if (!(error instanceof Error)) return false
  const {message} = error
  return (
    message === 'No auth found'
    || message.startsWith('No auth found for ')
    || message === 'Netrc credential does not match the requested account for host'
  )
}
