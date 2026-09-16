/**
 * Signals that a netrc mutation committed, but a subsequent operation failed.
 */
export type NetrcPostCommitOperation = 'remove' | 'save' | 'stale-cleanup'

type NetrcPostCommitErrorOptions = {
  operation?: NetrcPostCommitOperation
} & ErrorOptions

export class NetrcPostCommitError extends Error {
  public readonly code = 'NETRC_POST_COMMIT_FAILURE' as const
  public readonly committed = true as const
  public readonly operation?: NetrcPostCommitOperation

  public constructor(message: string, options?: NetrcPostCommitErrorOptions) {
    super(message, options)
    this.name = 'NetrcPostCommitError'
    this.operation = options?.operation
  }
}

const OPERATIONS = new Set<NetrcPostCommitOperation>(['remove', 'save', 'stale-cleanup'])

export function isNetrcPostCommitOperation(operation: unknown): operation is NetrcPostCommitOperation {
  return OPERATIONS.has(operation as NetrcPostCommitOperation)
}

/**
 * Identifies post-commit failures across package copies and JavaScript realms.
 *
 * @param error - Candidate failure
 * @returns Whether the candidate has the trusted post-commit marker structure
 */
export function isNetrcPostCommitError(error: unknown): error is NetrcPostCommitError {
  if ((typeof error !== 'object' && typeof error !== 'function') || error === null) return false

  try {
    const candidate = error as Partial<NetrcPostCommitError>
    const {code, committed, operation} = candidate
    return code === 'NETRC_POST_COMMIT_FAILURE'
      && committed === true
      && (operation === undefined || isNetrcPostCommitOperation(operation))
  } catch {
    return false
  }
}
