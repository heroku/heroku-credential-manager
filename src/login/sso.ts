import type {
  LoginBrowser, LoginOutput, LoginProgress, LoginPrompt,
} from './types.js'

import {type RequestContext, validateAccount} from './oauth.js'

type SsoOptions = {
  apiUrl: string
  browser?: LoginBrowser
  defaultOrganization?: string
  output: LoginOutput
  progress: LoginProgress
  prompt: LoginPrompt
  ssoUrl?: string
}

function required(value: string, description: string): string {
  if (!value.trim()) throw new Error(`${description} is required`)
  return value
}

export async function ssoLogin(
  context: RequestContext,
  options: SsoOptions,
): Promise<{account: string, token: string}> {
  const url = options.ssoUrl || `https://sso.heroku.com/saml/${encodeURIComponent(required(
    await options.prompt.organization(options.defaultOrganization),
    'Organization name',
  ))}/init?cli=true`

  options.output.write('Opening browser to:')
  options.output.write(url)
  options.output.write('If the browser fails to open or you are authenticating remotely, manually open the URL above.')
  if (options.browser) {
    try {
      await options.browser.open(url)
    } catch {
      options.output.warn('Cannot open browser. Continue with the manual URL above.')
    }
  } else {
    options.output.warn('Cannot open browser. Continue with the manual URL above.')
  }

  const token = required(await options.prompt.accessToken(), 'Access token')
  options.progress.start('Validating token')
  const account = await validateAccount(context, options.apiUrl, token)
  return {account, token}
}
