import type {LoginPrompt} from './types.js'

import {LoginHttpError} from './http.js'
import {createOAuthToken, type RequestContext} from './oauth.js'

type InteractiveOptions = {
  apiUrl: string
  expiresIn?: number
  hostname: string
  previousAccount?: string
  prompt: LoginPrompt
}

function errorId(error: unknown): string | undefined {
  return error instanceof LoginHttpError ? error.id : undefined
}

export async function interactiveLogin(
  context: RequestContext,
  options: InteractiveOptions,
): Promise<{account: string, token: string}> {
  const username = await options.prompt.email(options.previousAccount)
  const password = await options.prompt.password()

  try {
    return await createOAuthToken(context, {
      apiUrl: options.apiUrl,
      expiresIn: options.expiresIn,
      hostname: options.hostname,
      password,
      username,
    })
  } catch (error) {
    if (errorId(error) === 'device_trust_required') {
      const body = {
        ...(error instanceof LoginHttpError ? error.body : {}),
        message: 'The interactive flag requires Two-Factor Authentication to be enabled on your account. Please use heroku login.',
      }
      throw new LoginHttpError((error as LoginHttpError).status, body)
    }

    if (errorId(error) !== 'two_factor') throw error
    const secondFactor = await options.prompt.secondFactor()
    return createOAuthToken(context, {
      apiUrl: options.apiUrl,
      expiresIn: options.expiresIn,
      hostname: options.hostname,
      password,
      secondFactor,
      username,
    })
  }
}
