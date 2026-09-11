import type {LoginHttp, LoginHttpRequest} from './types.js'

import {checkedRequest} from './http.js'

export const THIRTY_DAYS = 60 * 60 * 24 * 30
export const API_ACCEPT = 'application/vnd.heroku+json; version=3'

export type RequestContext = {
  http: LoginHttp
  requestTimeoutMs?: number
  signal: AbortSignal
}

type OAuthAuthorization = {
  access_token?: {token?: unknown}
  id?: unknown
  user?: {email?: unknown}
}

export function bearerHeaders(token: string): Record<string, string> {
  return {
    accept: API_ACCEPT,
    authorization: `Bearer ${token}`,
  }
}

export function requestOptions(
  context: RequestContext,
  method: LoginHttpRequest['method'],
  options: Omit<LoginHttpRequest, 'method' | 'signal' | 'timeoutMs'> = {},
): LoginHttpRequest {
  return {
    ...options,
    method,
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

  const {body} = await checkedRequest<OAuthAuthorization>(context.http, `${options.apiUrl}/oauth/authorizations`, requestOptions(context, 'POST', {
    body: {
      description: `Heroku CLI login from ${options.hostname}`,
      // API wire field.
      // eslint-disable-next-line camelcase
      expires_in: options.expiresIn || THIRTY_DAYS,
      scope: ['global'],
    },
    headers,
  }), [options.username, options.password, basicCredentials, authorization, options.secondFactor ?? ''])

  return {
    account: requiredString(body?.user?.email, 'an account email'),
    token: requiredString(body?.access_token?.token, 'an access token'),
  }
}

export async function validateAccount(
  context: RequestContext,
  apiUrl: string,
  token: string,
): Promise<string> {
  const {body} = await checkedRequest<{email?: unknown}>(context.http, `${apiUrl}/account`, requestOptions(context, 'GET', {
    headers: bearerHeaders(token),
  }), [token, `Bearer ${token}`])
  return requiredString(body?.email, 'an account email')
}
