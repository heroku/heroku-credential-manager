/**
 * Signals that a netrc mutation committed, but a subsequent operation failed.
 */
export class NetrcPostCommitError extends Error {
  public readonly code = 'NETRC_POST_COMMIT_FAILURE' as const
  public readonly committed = true as const

  public constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'NetrcPostCommitError'
  }
}
