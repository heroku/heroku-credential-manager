import {NativeCredentialNotFoundError} from '../native-credential-not-found-error.js'

/**
 * True when `error` indicates the requested credential simply does not exist in
 * any store (native keychain or netrc), rather than a genuine failure worth
 * surfacing. Recognizes `NativeCredentialNotFoundError` plus the "not found"
 * messages thrown by {@link getAuth} and the netrc handler:
 *
 * - `No auth found` / `No auth found for <host>`
 * - `Netrc credential does not match the requested account for host`
 *
 * Hosts use this to tell "not logged in yet" apart from an error to report.
 */
export function isMissingCredentialError(error: unknown): boolean {
  if (error instanceof NativeCredentialNotFoundError) return true
  if (!(error instanceof Error)) return false
  const {message} = error
  return (
    message === 'No auth found'
    || message.startsWith('No auth found for ')
    || message === 'Netrc credential does not match the requested account for host'
  )
}
