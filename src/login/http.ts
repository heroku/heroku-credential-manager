import {createRequire} from 'node:module'

import type {LoginHttp, LoginHttpRequest, LoginHttpResponse} from './types.js'

import {
  NetrcPostCommitError,
  type NetrcPostCommitOperation,
  isNetrcPostCommitError,
  isNetrcPostCommitOperation,
} from '../netrc-post-commit-error.js'

const require = createRequire(import.meta.url)
const packageMetadata = require('../../package.json') as {name: string, version: string}
const USER_AGENT = `${packageMetadata.name}/${packageMetadata.version} node-${process.version}`

type ErrorBody = {
  id?: unknown
  message?: unknown
  resource?: unknown
}

type SanitizationOptions = {
  normalizeHttpError?: boolean
  preserveCause?: boolean
  preserveHttpDetails?: boolean
}

type ProjectionContext = {
  depth: number
  preserveCause: boolean
  seen: Set<Error>
}

type StorageProjectionContext = {
  depth: number
  postCommitBearingErrors: Set<object>
  postCommitErrors: Set<object>
  projected: Map<object, Error>
}

const MAX_CAUSE_DEPTH = 8
const SCRUBBED = '[SCRUBBED]'
const SAFE_STORAGE_ERROR = 'Credential storage operation failed'
const SAFE_NETRC_POST_COMMIT_ERROR = 'Netrc mutation committed but a subsequent operation failed'

export type LoginHttpErrorBody = {
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

function publicBody(body: unknown, variants: readonly string[] = []): LoginHttpErrorBody | undefined {
  if (!body || typeof body !== 'object') return
  const candidate = body as ErrorBody
  const result: LoginHttpErrorBody = {}
  for (const field of ['id', 'message', 'resource'] as const) {
    let value: unknown
    try {
      value = candidate[field]
    } catch {
      continue
    }

    if (typeof value === 'string') result[field] = scrubSensitiveText(value, variants)
  }

  return Object.keys(result).length > 0 ? result : undefined
}

function bodyMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return
  const {id, message} = body as ErrorBody
  const usefulMessage = typeof message === 'string' && message.trim() ? message : undefined
  const usefulId = typeof id === 'string' && id.trim() ? id : undefined

  if (usefulMessage && usefulId) return `${usefulMessage}\nError ID: ${usefulId}`
  if (usefulMessage) return usefulMessage
  if (usefulId) return `Error ID: ${usefulId}`
}

/**
 * Public error for an unsuccessful login HTTP response.
 *
 * Its body is limited to safe Heroku error fields (`id`, `message`, and `resource`),
 * and known credentials are scrubbed from both the body and message.
 */
export class LoginHttpError extends Error {
  /** Sanitized response error fields, when provided by the server. */
  body?: LoginHttpErrorBody
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
    this.name = 'LoginHttpError'
    this.status = status
  }
}

function statusFrom(error: Record<string, unknown>): number | undefined {
  if (typeof error.status === 'number') return error.status
  if (typeof error.statusCode === 'number') return error.statusCode

  const {http} = error
  if (http && typeof http === 'object' && typeof (http as {statusCode?: unknown}).statusCode === 'number') {
    return (http as {statusCode: number}).statusCode
  }
}

function bodyFrom(error: Record<string, unknown>): unknown {
  if ('body' in error) return error.body
  const {http} = error
  if (http && typeof http === 'object' && 'body' in http) return (http as {body?: unknown}).body
}

export function normalizeLoginHttpError(error: unknown): Error | LoginHttpError {
  if (error instanceof LoginHttpError) return error
  if (!error || typeof error !== 'object') return error instanceof Error ? error : new Error('Login request failed')

  const record = error as Record<string, unknown>
  const status = statusFrom(record)
  if (status === undefined) return error instanceof Error ? error : new Error('Login request failed')

  const body = bodyFrom(record)
  const message = bodyMessage(body)
  return new LoginHttpError(status, body, message)
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

function aggregateErrors(error: AggregateError): undefined | unknown[] {
  try {
    return [...error.errors as Iterable<unknown>]
  } catch {
    return undefined
  }
}

function collectNetrcPostCommitErrors(
  error: unknown,
  postCommitErrors: Set<object>,
  linksByError: Map<object, unknown[]>,
  seen = new Set<object>(),
): void {
  if ((typeof error !== 'object' && typeof error !== 'function') || error === null || seen.has(error)) return
  seen.add(error)

  if (isNetrcPostCommitError(error)) {
    postCommitErrors.add(error)
  }

  const links: unknown[] = []
  if (error instanceof AggregateError) links.push(...(aggregateErrors(error) ?? []))
  if (error instanceof Error || postCommitErrors.has(error)) links.push(errorCause(error as Error))
  linksByError.set(error, links)
  for (const link of links) {
    collectNetrcPostCommitErrors(link, postCommitErrors, linksByError, seen)
  }
}

function errorsContainingNetrcPostCommitErrors(
  postCommitErrors: Set<object>,
  linksByError: Map<object, unknown[]>,
): Set<object> {
  const bearingErrors = new Set(postCommitErrors)
  let changed = true
  while (changed) {
    changed = false
    for (const [error, links] of linksByError) {
      if (bearingErrors.has(error)) continue
      if (links.some(link => bearingErrors.has(link as object))) {
        bearingErrors.add(error)
        changed = true
      }
    }
  }

  return bearingErrors
}

function safeNetrcPostCommitOperation(error: unknown): NetrcPostCommitOperation | undefined {
  try {
    const {operation} = error as {operation?: unknown}
    return isNetrcPostCommitOperation(operation) ? operation : undefined
  } catch {
    return undefined
  }
}

function safeStorageCause(
  cause: unknown,
  context: StorageProjectionContext,
): Error | string | undefined {
  if (typeof cause === 'string') return SAFE_STORAGE_ERROR
  if (!(cause instanceof Error) && !context.postCommitBearingErrors.has(cause as object)) return
  return safeStorageErrorProjection(cause as Error | NetrcPostCommitError, context)
}

function safeStorageErrorProjection(
  error: Error | NetrcPostCommitError,
  context: StorageProjectionContext,
): Error {
  const existing = context.projected.get(error)
  if (existing) return existing

  if (context.postCommitErrors.has(error)) {
    const projected = new NetrcPostCommitError(SAFE_NETRC_POST_COMMIT_ERROR, {
      operation: safeNetrcPostCommitOperation(error),
    })
    context.projected.set(error, projected)
    Object.defineProperty(projected, 'cause', {
      configurable: true,
      value: safeStorageCause(errorCause(error), {...context, depth: context.depth + 1}),
      writable: true,
    })
    return projected
  }

  if (context.depth >= MAX_CAUSE_DEPTH) return new Error('Storage error depth exceeded')

  if (error instanceof AggregateError && context.postCommitBearingErrors.has(error)) {
    const projected = new AggregateError([], SAFE_STORAGE_ERROR)
    context.projected.set(error, projected)
    const errors = aggregateErrors(error) ?? []
    projected.errors = errors.map(child => child instanceof Error || context.postCommitErrors.has(child as object)
      ? safeStorageErrorProjection(child as Error | NetrcPostCommitError, {...context, depth: context.depth + 1})
      : new Error(SAFE_STORAGE_ERROR))
    Object.defineProperty(projected, 'cause', {
      configurable: true,
      value: safeStorageCause(errorCause(error), {...context, depth: context.depth + 1}),
      writable: true,
    })
    return projected
  }

  const projected = new Error(SAFE_STORAGE_ERROR)
  context.projected.set(error, projected)
  Object.defineProperty(projected, 'cause', {
    configurable: true,
    value: safeStorageCause(errorCause(error), {...context, depth: context.depth + 1}),
    writable: true,
  })
  return projected
}

export function sanitizePublicError(
  error: unknown,
  sensitiveValues: readonly string[] = [],
  options: SanitizationOptions = {},
): Error {
  try {
    const postCommitErrors = new Set<object>()
    const linksByError = new Map<object, unknown[]>()
    collectNetrcPostCommitErrors(error, postCommitErrors, linksByError)
    if (postCommitErrors.size > 0) {
      return safeStorageErrorProjection(error as Error, {
        depth: 0,
        postCommitBearingErrors: errorsContainingNetrcPostCommitErrors(postCommitErrors, linksByError),
        postCommitErrors,
        projected: new Map<object, Error>(),
      })
    }

    if (!(error instanceof Error)) return new Error('Login request failed')
    const normalized = options.normalizeHttpError ? normalizeLoginHttpError(error) : error
    if (normalized instanceof LoginHttpError && (options.preserveHttpDetails ?? true)) {
      return new LoginHttpError(normalized.status, normalized.body, undefined, sensitiveValues)
    }

    const variants = sensitiveVariants(sensitiveValues)
    return safeErrorProjection(normalized, variants, {
      depth: 0,
      preserveCause: options.preserveCause ?? true,
      seen: new Set<Error>(),
    })
  } catch {
    return new Error('Login request failed')
  }
}

export async function checkedRequest<T>(
  http: LoginHttp,
  url: string,
  options: LoginHttpRequest,
  sensitiveValues: readonly string[] = [],
): Promise<LoginHttpResponse<T>> {
  try {
    const response = await http.request<T>(url, options)
    if (!response.ok) throw new LoginHttpError(response.status, response.body, undefined, sensitiveValues)
    return response
  } catch (error) {
    throw sanitizePublicError(error, sensitiveValues, {normalizeHttpError: true})
  }
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

export class FetchLoginHttp implements LoginHttp {
  async request<T>(url: string, options: LoginHttpRequest): Promise<LoginHttpResponse<T>> {
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
      const hasBody = options.body !== undefined
      const hasUserAgent = Object.keys(options.headers ?? {}).some(header => header.toLowerCase() === 'user-agent')
      const response = await fetch(url, {
        body: hasBody ? JSON.stringify(options.body) : undefined,
        headers: {
          ...(hasBody ? {'content-type': 'application/json'} : {}),
          ...(hasUserAgent ? {} : {'user-agent': USER_AGENT}),
          ...options.headers,
        },
        method: options.method,
        redirect: 'error',
        signal: controller.signal,
      })

      return {
        body: await responseBody(response) as T,
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok,
        status: response.status,
      }
    } catch (error) {
      if (timedOut) throw new Error('Login request timed out')
      if (options.signal?.aborted && options.signal.reason instanceof Error) throw options.signal.reason
      throw error
    } finally {
      if (timer) clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
    }
  }
}
