/**
 * A structural subset of the process environment that `resolveEnvAuth` reads.
 * Declared explicitly (rather than `NodeJS.ProcessEnv`) so the public type does
 * not depend on `@types/node` being present in a consumer's project. Both
 * `process.env` and plain object literals (such as test fixtures) are
 * assignable to it.
 */
export type EnvAuthSource = {
  readonly HEROKU_API_KEY?: string | undefined
  readonly HEROKU_API_TOKEN?: string | undefined
}

/** A machine-readable code identifying which environment warning fired. */
export type EnvAuthWarningCode = 'HEROKU_API_TOKEN_WITHOUT_KEY'

/**
 * A non-fatal warning to surface. The `code` lets callers branch or localize;
 * `message` is a ready-to-print English default. Emitting it is the caller's
 * responsibility; `resolveEnvAuth` performs no logging or other I/O.
 */
export type EnvAuthWarning = {
  readonly code: EnvAuthWarningCode
  readonly message: string
}

/**
 * The result of resolving Heroku credentials from environment variables.
 */
export type EnvAuthResolution = {
  /** The token from `HEROKU_API_KEY`, when set. Account is unknown for env tokens. */
  token?: string | undefined
  /** A warning to surface, e.g. when `HEROKU_API_TOKEN` is set without `HEROKU_API_KEY`. */
  warning?: EnvAuthWarning | undefined
}

/**
 * Pure policy for environment-variable credential precedence, shared by hosts
 * (such as the Heroku CLI) that resolve a token before consulting stored
 * credentials. `HEROKU_API_KEY` provides the token; `HEROKU_API_TOKEN` set
 * without `HEROKU_API_KEY` yields a `warning` and no token. An empty
 * `HEROKU_API_KEY` is treated as unset.
 */
export function resolveEnvAuth(env: EnvAuthSource = process.env): EnvAuthResolution {
  const warning: EnvAuthWarning | undefined = env.HEROKU_API_TOKEN && !env.HEROKU_API_KEY
    ? {code: 'HEROKU_API_TOKEN_WITHOUT_KEY', message: 'HEROKU_API_TOKEN is set but you probably meant HEROKU_API_KEY'}
    : undefined
  return {token: env.HEROKU_API_KEY || undefined, warning}
}
