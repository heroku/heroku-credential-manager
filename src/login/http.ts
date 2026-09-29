import {createRequire} from 'node:module'

import type {
  FetchLike, HerokuApiClientLike, HerokuApiRequestOptions, HerokuApiResponse,
} from './types.js'

const require = createRequire(import.meta.url)
const packageMetadata = require('../../package.json') as {name: string, version: string}
const USER_AGENT = `${packageMetadata.name}/${packageMetadata.version} node-${process.version}`

type ErrorBody = {
  id?: unknown
  message?: unknown
  resource?: unknown
}

type SanitizationOptions = {
  normalizeRequestError?: boolean
  preserveCause?: boolean
  preserveRequestDetails?: boolean
}

type ProjectionContext = {
  depth: number
  preserveCause: boolean
  seen: Set<Error>
}

const MAX_CAUSE_DEPTH = 8
const SCRUBBED = '[SCRUBBED]'

export type LoginRequestErrorBody = {
  id?: string
  message?: string
  resource?: string
}

function sensitiveVariants(sensitiveValues: readonly string[]): string[] {
  return [...new Set(sensitiveValues.flatMap(value => {
    const normalized = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
    const crlfNormalized = normalized.replaceAll('\n', '\r\n')
    return [value, normalized, crlfNormalized].flatMap(variant => [variant, Buffer.from(variant, 'utf8').toString('base64')])
  }).filter(Boolean))].sort((left, right) => right.length - left.length)
}

function scrubSensitiveText(text: string, variants: readonly string[]): string {
  let scrubbed = text
  for (const value of variants) scrubbed = scrubbed.replaceAll(value, SCRUBBED)
  return scrubbed
}

function fieldFrom(body: ErrorBody, field: keyof ErrorBody): unknown {
  try {
    return body[field]
  } catch {
    return undefined
  }
}

function publicBody(body: unknown, variants: readonly string[] = []): LoginRequestErrorBody | undefined {
  if (!body || typeof body !== 'object') return
  const candidate = body as ErrorBody
  const result: LoginRequestErrorBody = {}
  for (const field of ['id', 'message', 'resource'] as const) {
    const value = fieldFrom(candidate, field)
    if (typeof value === 'string') result[field] = scrubSensitiveText(value, variants)
  }

  return Object.keys(result).length > 0 ? result : undefined
}

function bodyMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return
  const candidate = body as ErrorBody
  const message = fieldFrom(candidate, 'message')
  const id = fieldFrom(candidate, 'id')
  const usefulMessage = typeof message === 'string' && message.trim() ? message : undefined
  const usefulId = typeof id === 'string' && id.trim() ? id : undefined

  if (usefulMessage && usefulId) return `${usefulMessage}\nError ID: ${usefulId}`
  if (usefulMessage) return usefulMessage
  if (usefulId) return `Error ID: ${usefulId}`
}

/**
 * Public error for an unsuccessful login request.
 *
 * Its body is limited to safe Heroku error fields (`id`, `message`, and `resource`),
 * and known credentials are scrubbed from both the body and message.
 */
export class LoginRequestError extends Error {
  /** Sanitized response error fields, when provided by the server. */
  body?: LoginRequestErrorBody
  /** Heroku error identifier, when present. */
  id?: string
  /** HTTP response status code. */
  status: number

  constructor(status: number, body?: unknown, message?: string, sensitiveValues: readonly string[] = []) {
    const variants = sensitiveVariants(sensitiveValues)
    const safeBody = publicBody(body, variants)
    const safeMessage = typeof message === 'string' ? scrubSensitiveText(message, variants) : undefined
    super(safeMessage ?? bodyMessage(safeBody) ?? `Login request failed with status ${status}`)
    this.body = safeBody
    this.id = safeBody?.id
    this.name = 'LoginRequestError'
    this.status = status
  }
}

function numericProperty(record: Record<string, unknown>, property: string): number | undefined {
  try {
    const value = record[property]
    return typeof value === 'number' ? value : undefined
  } catch {
    return undefined
  }
}

function objectProperty(record: Record<string, unknown>, property: string): Record<string, unknown> | undefined {
  try {
    const value = record[property]
    return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function statusFrom(error: Record<string, unknown>): number | undefined {
  const status = numericProperty(error, 'status') ?? numericProperty(error, 'statusCode')
  if (status !== undefined) return status
  const http = objectProperty(error, 'http')
  return http ? numericProperty(http, 'statusCode') ?? numericProperty(http, 'status') : undefined
}

function bodyFrom(error: Record<string, unknown>): unknown {
  try {
    if ('body' in error) return error.body
  } catch {}

  const http = objectProperty(error, 'http')
  if (!http) return
  try {
    if ('body' in http) return http.body
  } catch {}
}

/** Converts common client error shapes to the package's stable request error. */
export function normalizeLoginRequestError(error: unknown): Error | LoginRequestError {
  if (error instanceof LoginRequestError) return error
  if (!error || typeof error !== 'object') return error instanceof Error ? error : new Error('Login request failed')

  const record = error as Record<string, unknown>
  const status = statusFrom(record)
  if (status === undefined) return error instanceof Error ? error : new Error('Login request failed')

  const body = bodyFrom(record)
  return new LoginRequestError(status, body, bodyMessage(body))
}

function errorString(error: Error, field: 'message' | 'name', fallback: string): string {
  try {
    const value = error[field]
    return typeof value === 'string' ? value : fallback
  } catch {
    return fallback
  }
}

function errorCause(error: Error): unknown {
  try {
    return error.cause
  } catch {
    return undefined
  }
}

function safeCause(
  cause: unknown,
  variants: readonly string[],
  seen: Set<Error>,
  depth: number,
): Error | string | undefined {
  if (typeof cause === 'string') return scrubSensitiveText(cause, variants)
  if (!(cause instanceof Error)) return
  if (depth >= MAX_CAUSE_DEPTH) return new Error('Transport error cause depth exceeded')
  return safeErrorProjection(cause, variants, {depth, preserveCause: true, seen})
}

function safeErrorProjection(
  error: Error,
  variants: readonly string[],
  context?: ProjectionContext,
): Error {
  const projection = context ?? {depth: 0, preserveCause: true, seen: new Set<Error>()}
  if (projection.seen.has(error)) return new Error('Cyclic transport error cause')
  projection.seen.add(error)

  const message = scrubSensitiveText(errorString(error, 'message', 'Login request failed'), variants)
  const name = scrubSensitiveText(errorString(error, 'name', 'Error'), variants)
  const cause = projection.preserveCause
    ? safeCause(errorCause(error), variants, projection.seen, projection.depth + 1)
    : undefined
  const projected = cause === undefined ? new Error(message) : new Error(message, {cause})
  projected.name = name
  return projected
}

export function sanitizePublicError(
  error: unknown,
  sensitiveValues: readonly string[] = [],
  options: SanitizationOptions = {},
): Error {
  try {
    const normalized = options.normalizeRequestError ? normalizeLoginRequestError(error) : error
    if (!(normalized instanceof Error)) return new Error('Login request failed')
    if (normalized instanceof LoginRequestError && (options.preserveRequestDetails ?? true)) {
      return new LoginRequestError(normalized.status, normalized.body, undefined, sensitiveValues)
    }

    return safeErrorProjection(normalized, sensitiveVariants(sensitiveValues), {
      depth: 0,
      preserveCause: options.preserveCause ?? true,
      seen: new Set<Error>(),
    })
  } catch {
    return new Error('Login request failed')
  }
}

function successful(status: number): boolean {
  return status >= 200 && status < 300
}

function checkedResponse<T>(response: HerokuApiResponse<T>, sensitiveValues: readonly string[]): HerokuApiResponse<T> {
  if (!successful(response.status)) {
    throw new LoginRequestError(response.status, response.body, undefined, sensitiveValues)
  }

  return response
}

async function checkedHerokuApiRequest<T>(
  request: () => Promise<HerokuApiResponse<T>>,
  sensitiveValues: readonly string[] = [],
): Promise<HerokuApiResponse<T>> {
  try {
    return checkedResponse(await request(), sensitiveValues)
  } catch (error) {
    throw sanitizePublicError(error, sensitiveValues, {normalizeRequestError: true})
  }
}

/** Performs a checked GET through an injected Heroku Platform API client. */
export async function herokuApiGet<T>(
  api: HerokuApiClientLike,
  path: string,
  options?: HerokuApiRequestOptions,
  sensitiveValues: readonly string[] = [],
): Promise<HerokuApiResponse<T>> {
  return checkedHerokuApiRequest(() => api.get<T>(path, options), sensitiveValues)
}

/** Performs a checked DELETE through an injected Heroku Platform API client. */
export async function herokuApiDelete<T>(
  api: HerokuApiClientLike,
  path: string,
  options?: HerokuApiRequestOptions,
  sensitiveValues: readonly string[] = [],
): Promise<HerokuApiResponse<T>> {
  return checkedHerokuApiRequest(() => api.delete<T>(path, options), sensitiveValues)
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function defaultFetch(): FetchLike {
  return globalThis.fetch.bind(globalThis)
}

async function fetchResponse<T>(
  fetchImplementation: FetchLike | undefined,
  url: string,
  init: RequestInit,
  options: HerokuApiRequestOptions,
  sensitiveValues: readonly string[],
): Promise<HerokuApiResponse<T>> {
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason)
  let timedOut = false
  if (options.signal?.aborted) abort()
  else options.signal?.addEventListener('abort', abort, {once: true})

  const timer = options.timeoutMs === undefined
    ? undefined
    : setTimeout(() => {
      timedOut = true
      controller.abort(new Error('Login request timed out'))
    }, options.timeoutMs)
  timer?.unref()

  try {
    const fetch = fetchImplementation ?? defaultFetch()
    const response = await fetch(url, {
      ...init,
      redirect: 'error',
      signal: controller.signal,
    })
    const result: HerokuApiResponse<T> = {
      body: await responseBody(response) as T,
      headers: Object.fromEntries(response.headers.entries()),
      status: response.status,
    }

    return checkedResponse(result, sensitiveValues)
  } catch (error) {
    if (timedOut) throw new Error('Login request timed out')
    if (options.signal?.aborted && options.signal.reason instanceof Error) throw options.signal.reason
    throw sanitizePublicError(error, sensitiveValues, {normalizeRequestError: true})
  } finally {
    if (timer) clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}

function requestHeaders(headers: Record<string, string> | undefined, hasBody: boolean): Record<string, string> {
  const hasUserAgent = Object.keys(headers ?? {}).some(header => header.toLowerCase() === 'user-agent')
  return {
    ...(hasBody ? {'content-type': 'application/json'} : {}),
    ...(hasUserAgent ? {} : {'user-agent': USER_AGENT}),
    ...headers,
  }
}

/** Performs a checked JSON POST using an injected fetch, or global fetch resolved at call time. */
export async function fetchJsonPost<T>(
  fetchImplementation: FetchLike | undefined,
  url: string,
  body: unknown,
  options: HerokuApiRequestOptions = {},
  sensitiveValues: readonly string[] = [],
): Promise<HerokuApiResponse<T>> {
  return fetchResponse(fetchImplementation, url, {
    body: JSON.stringify(body),
    headers: requestHeaders(options.headers, true),
    method: 'POST',
  }, options, sensitiveValues)
}

/** Performs a checked non-Platform GET using an injected fetch, or global fetch resolved at call time. */
export async function fetchGet<T>(
  fetchImplementation: FetchLike | undefined,
  url: string,
  options: HerokuApiRequestOptions = {},
  sensitiveValues: readonly string[] = [],
): Promise<HerokuApiResponse<T>> {
  return fetchResponse(fetchImplementation, url, {
    headers: requestHeaders(options.headers, false),
    method: 'GET',
  }, options, sensitiveValues)
}
