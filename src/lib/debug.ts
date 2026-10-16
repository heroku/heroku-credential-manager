import debug from 'debug'

/**
 * Shared debug logger for the credential manager. Namespaced `heroku:credential-manager`
 * to match the `heroku:<package>` convention used across Heroku's Node libraries
 * (e.g. `heroku:fetch:*`).
 *
 * Enable with `DEBUG=heroku:credential-manager` (or `DEBUG=heroku:*`).
 */
export const credDebug = debug('heroku:credential-manager')
