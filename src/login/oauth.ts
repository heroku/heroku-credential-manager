import type {
  FetchLike, HerokuApiClientLike, HerokuApiRequestOptions,
} from './types.js'

import {fetchJsonPost, herokuApiGet, sanitizePublicError} from './http.js'

export const THIRTY_DAYS = 60 * 60 * 24 * 30
export const API_ACCEPT = 'application/vnd.heroku+json; version=3'

export type RequestContext = {
  apiClientForToken(token: string): HerokuApiClientLike
  fetch?: FetchLike
  requestTimeoutMs?: number
  signal: AbortSignal
}

type OAuthAuthorization = {
  access_token?: {token?: unknown}
  id?: unknown
  user?: {email?: unknown}
}

export function requestOptions(
  context: RequestContext,
  options: Omit<HerokuApiRequestOptions, 'signal' | 'timeoutMs'> = {},
): HerokuApiRequestOptions {
  return {
    ...options,
    signal: context.signal,
    timeoutMs: context.requestTimeoutMs,
  }
}

function requiredString(value: unknown, description: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Login response did not include ${description}`)
  return value
}

export async function createOAuthToken(context: RequestContext, options: {
  apiUrl: string
  expiresIn?: number
  hostname: string
  password: string
  secondFactor?: string
  username: string
}): Promise<{account: string, token: string}> {
  const basicCredentials = `${options.username}:${options.password}`
  const authorization = `Basic ${Buffer.from(basicCredentials, 'utf8').toString('base64')}`
  const headers: Record<string, string> = {
    accept: API_ACCEPT,
    authorization,
  }
  if (options.secondFactor) headers['Heroku-Two-Factor-Code'] = options.secondFactor

  const {body} = await fetchJsonPost<OAuthAuthorization>(
    context.fetch,
    `${options.apiUrl}/oauth/authorizations`,
    {
      description: `Heroku CLI login from ${options.hostname}`,
      // API wire field.
      // eslint-disable-next-line camelcase
      expires_in: options.expiresIn || THIRTY_DAYS,
      scope: ['global'],
    },
    requestOptions(context, {
      headers,
    }),
    [options.username, options.password, basicCredentials, authorization, options.secondFactor ?? ''],
  )

  return {
    account: requiredString(body?.user?.email, 'an account email'),
    token: requiredString(body?.access_token?.token, 'an access token'),
  }
}

export async function validateAccount(
  context: RequestContext,
  token: string,
): Promise<string> {
  let api: HerokuApiClientLike
  try {
    api = await context.apiClientForToken(token)
  } catch (error) {
    throw sanitizePublicError(error, [token, `Bearer ${token}`])
  }

  const {body} = await herokuApiGet<{email?: unknown}>(api, '/account', requestOptions(context), [token, `Bearer ${token}`])
  return requiredString(body?.email, 'an account email')
}
