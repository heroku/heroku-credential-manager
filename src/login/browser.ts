import type {
  LoginBrowser, LoginEnvironment, LoginOutput, LoginProgress,
} from './types.js'

import {
  LoginHttpError, checkedRequest, normalizeLoginHttpError, sanitizePublicError,
} from './http.js'
import {
  type RequestContext, requestOptions, validateAccount,
} from './oauth.js'

type BrowserOptions = {
  apiUrl: string
  browser?: LoginBrowser
  browserName?: string
  environment: LoginEnvironment
  hostname: string
  loginHost: string
  output: LoginOutput
  progress: LoginProgress
}

function requiredString(value: unknown, description: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Login response did not include ${description}`)
  return value
}

function loginUrl(value: unknown, description: string, loginHost: string): string {
  const path = requiredString(value, description)
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/@') || path.includes('\\')) {
    throw new Error(`Login response ${description} must be a root-relative path`)
  }

  const base = new URL(loginHost)
  const resolved = new URL(path, base)
  if (resolved.origin !== base.origin || resolved.username || resolved.password) {
    throw new Error(`Login response ${description} must be a root-relative path`)
  }

  return resolved.href
}

async function pollForAuth(
  context: RequestContext,
  url: string,
  temporaryToken: string,
): Promise<{access_token?: unknown, error?: unknown}> {
  for (let attempt = 0; ; attempt++) {
    try {
      // Sequential retry is required by the CLI auth service contract.
      // eslint-disable-next-line no-await-in-loop
      return (await checkedRequest<{access_token?: unknown, error?: unknown}>(context.http, url, requestOptions(context, 'GET', {
        headers: {authorization: `Bearer ${temporaryToken}`},
      }), [temporaryToken, `Bearer ${temporaryToken}`])).body
    } catch (error) {
      const normalized = normalizeLoginHttpError(error)
      if (normalized instanceof LoginHttpError && normalized.status > 500 && attempt < 3) continue
      throw normalized
    }
  }
}

export async function browserLogin(
  context: RequestContext,
  options: BrowserOptions,
): Promise<{account: string, token: string}> {
  const {body} = await checkedRequest<{browser_url?: unknown, cli_url?: unknown, token?: unknown}>(
    context.http,
    `${options.loginHost}/auth`,
    requestOptions(context, 'POST', {
      body: {description: `Heroku CLI login from ${options.hostname}`},
    }),
  )
  const browserUrl = loginUrl(body?.browser_url, 'a browser URL', options.loginHost)
  const cliUrl = loginUrl(body?.cli_url, 'a CLI URL', options.loginHost)
  const temporaryToken = requiredString(body?.token, 'a temporary token')

  options.output.write(`Opening browser to ${browserUrl}`)
  options.output.warn('If browser does not open, visit:')
  options.output.write(browserUrl)

  if (options.browser) {
    try {
      await options.browser.open(browserUrl, options.browserName ? {browser: options.browserName} : undefined)
    } catch {
      options.output.warn('Cannot open browser. Continue with the manual URL above.')
    }
  } else {
    options.output.warn('Cannot open browser. Continue with the manual URL above.')
  }

  if (options.environment.get('HEROKU_TESTING_HEADLESS_LOGIN') === '1') {
    options.output.warn('Browser login is running headlessly. Continue with the manual URL above.')
  }

  options.progress.start('heroku: Waiting for login')
  const auth = await pollForAuth(context, cliUrl, temporaryToken)
  if (typeof auth?.error === 'string' && auth.error.trim()) {
    const accessToken = typeof auth.access_token === 'string' ? auth.access_token : undefined
    throw sanitizePublicError(new Error(auth.error), [
      temporaryToken,
      `Bearer ${temporaryToken}`,
      ...(accessToken ? [accessToken, `Bearer ${accessToken}`] : []),
    ])
  }

  const token = requiredString(auth?.access_token, 'an access token')
  options.progress.start('Logging in')
  const account = await validateAccount(context, options.apiUrl, token)

  return {account, token}
}
