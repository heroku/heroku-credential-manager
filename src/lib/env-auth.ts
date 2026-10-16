/**
 * The result of resolving Heroku credentials from environment variables.
 */
export type EnvAuthResolution = {
  /** The token from `HEROKU_API_KEY`, when set. Account is unknown for env tokens. */
  token?: string
  /**
   * A non-fatal warning to surface, e.g. when `HEROKU_API_TOKEN` is set without
   * `HEROKU_API_KEY` (almost always a mistake). Emitting it is the caller's
   * responsibility; this function performs no logging or other I/O.
   */
  warning?: string
}

/**
 * Pure policy for environment-variable credential precedence, shared by hosts
 * (such as the Heroku CLI) that resolve a token before consulting stored
 * credentials. `HEROKU_API_KEY` provides the token; `HEROKU_API_TOKEN` set
 * without `HEROKU_API_KEY` yields a `warning` and no token. An empty
 * `HEROKU_API_KEY` is treated as unset.
 */
export function resolveEnvAuth(env: NodeJS.ProcessEnv = process.env): EnvAuthResolution {
  const warning = env.HEROKU_API_TOKEN && !env.HEROKU_API_KEY
    ? 'HEROKU_API_TOKEN is set but you probably meant HEROKU_API_KEY'
    : undefined
  return {token: env.HEROKU_API_KEY || undefined, warning}
}
