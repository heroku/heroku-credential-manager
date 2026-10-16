/** The default credential-store service name for the Heroku CLI. */
export const DEFAULT_CREDENTIAL_SERVICE = 'heroku-cli'

/** The production API host, which uses the bare default service name. */
export const DEFAULT_API_HOST = 'api.heroku.com'

/**
 * Derives the credential-store service name for a given API host. Production
 * (`api.heroku.com`) uses the bare `heroku-cli` service; every other host is
 * namespaced as `heroku-cli@<host>` so that staging and development credentials
 * never collide with production credentials in the OS keychain.
 */
export function credentialServiceForHost(apiHost: string): string {
  return apiHost === DEFAULT_API_HOST ? DEFAULT_CREDENTIAL_SERVICE : `${DEFAULT_CREDENTIAL_SERVICE}@${apiHost}`
}
