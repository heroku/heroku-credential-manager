import os from 'node:os'

import type {AuthEntry} from '../lib/types.js'
import type {
  LoginConfig,
  LoginDependencies,
  LoginEnvironment,
  LoginMethod,
  LoginOptions,
  LoginOutput,
  LoginProgress,
  LoginPrompt,
  LoginStorage,
  LoginTimers,
} from './types.js'

import {browserLogin} from './browser.js'
import {
  FetchLoginHttp, LoginHttpError, checkedRequest, normalizeLoginHttpError, sanitizePublicError,
} from './http.js'
import {interactiveLogin} from './interactive.js'
import {
  type RequestContext, THIRTY_DAYS, bearerHeaders, requestOptions,
} from './oauth.js'
import {ssoLogin} from './sso.js'
import {defaultLoginStorage} from './storage.js'

const LOGIN_TIMEOUT = 10 * 60 * 1000
const MAX_AUTHORIZATION_PAGES = 500
const REDACTED_TOKEN_ASTERISKS = '*'.repeat(10)
const DEFAULT_API_HOST = 'api.heroku.com'
const DEFAULT_CREDENTIAL_SERVICE = 'heroku-cli'
const METHODS = new Set<LoginMethod>(['browser', 'interactive', 'sso'])
const ALLOWED_HEROKU_DOMAINS = ['heroku.com', 'herokai.com', 'herokuspace.com', 'herokudev.com']

const defaultEnvironment: LoginEnvironment = {
  get: name => process.env[name],
}

const defaultOutput: LoginOutput = {
  warn: message => console.warn(message),
  write: message => console.error(message),
}

const defaultProgress: LoginProgress = {
  start: message => console.error(`${message}...`),
  stop() {},
}

const defaultTimers: LoginTimers = {
  clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
  setTimeout(handler, timeoutMs) {
    const timer = setTimeout(handler, timeoutMs)
    timer.unref()
    return timer
  },
}

const missingPrompt: LoginPrompt = {
  async accessToken() {
    throw new Error('An access token prompt must be provided')
  },
  async email() {
    throw new Error('An email prompt must be provided')
  },
  async loginMethod() {
    throw new Error('A login method prompt must be provided')
  },
  async organization() {
    throw new Error('An organization prompt must be provided')
  },
  async password() {
    throw new Error('A password prompt must be provided')
  },
  async secondFactor() {
    throw new Error('A two-factor prompt must be provided')
  },
}

type ResolvedConfig = Pick<LoginConfig, 'dataDir' | 'gitHost' | 'requestTimeoutMs' | 'ssoUrl'>
  & Required<Pick<LoginConfig, 'apiHost' | 'apiUrl' | 'credentialService' | 'hostname' | 'loginHost' | 'timeoutMs'>>

type Authorization = {
  access_token?: {token?: unknown}
  id?: unknown
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '::1' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

function isAllowedHerokuHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return isLoopback(normalized) || ALLOWED_HEROKU_DOMAINS.some(domain => normalized === domain || normalized.endsWith(`.${domain}`))
}

function safeUrl(value: string, description: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${description} must be an absolute HTTPS URL`)
  }

  const safeProtocol = url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback(url.hostname))
  if (!safeProtocol || url.username || url.password) {
    throw new Error(`${description} must be an absolute HTTPS URL without credentials`)
  }

  return url
}

function safeEndpointUrl(value: string, description: string): URL {
  const url = safeUrl(value, description)
  // URL normalizes empty delimiters away (`?`/`#` become empty search/hash), so inspect the trusted input syntax too.
  if (value.includes('?') || value.includes('#')) throw new Error(`${description} must not include a query or fragment`)
  return url
}

function safeHost(value: string, description: string): string {
  if (!value || /[\s\0#/?@\\]/.test(value)) throw new Error(`${description} must be a non-empty host with an optional port`)
  const normalized = value.toLowerCase()
  const authority = /^(?:\[[^\]]+]|[^:]+)(?::\d+)?$/
  if (!authority.test(normalized)) throw new Error(`${description} must be a non-empty host with an optional port`)
  try {
    const parsed = new URL(`https://${normalized}`)
    if (urlHost(`https://${normalized}`, parsed) !== normalized || parsed.pathname !== '/' || parsed.username || parsed.password) {
      throw new Error('Invalid host')
    }
  } catch {
    throw new Error(`${description} must be a non-empty host with an optional port`)
  }

  return normalized
}

function urlHost(value: string, url: URL): string {
  const authority = value.match(/^[a-z][\d+.a-z-]*:\/\/([^#/?]*)/i)?.[1]
  const port = authority?.match(/(?:]|[^:]):(\d+)$/)?.[1]
  return port ? `${url.hostname}:${port}` : url.host
}

function configuredApi(environment: LoginEnvironment): {apiUrl: string, gitHost?: string} {
  const configuredApiUrl = environment.get('HEROKU_API_URL')
  if (configuredApiUrl) {
    const url = safeEndpointUrl(configuredApiUrl, 'HEROKU_API_URL')
    if (!isAllowedHerokuHostname(url.hostname)) throw new Error('HEROKU_API_URL must use a Heroku or loopback host')
    return {apiUrl: configuredApiUrl}
  }

  const configuredHost = environment.get('HEROKU_HOST')
  if (!configuredHost) return {apiUrl: 'https://api.heroku.com', gitHost: 'git.heroku.com'}
  if (/^https?:\/\//i.test(configuredHost)) {
    const url = safeUrl(configuredHost, 'HEROKU_HOST')
    if (url.pathname !== '/' || url.search || url.hash || !isAllowedHerokuHostname(url.hostname)) {
      throw new Error('HEROKU_HOST must be a Heroku or loopback host without a path, query, or fragment')
    }

    return {apiUrl: configuredHost, gitHost: urlHost(configuredHost, url)}
  }

  const host = safeHost(configuredHost.toLowerCase(), 'HEROKU_HOST')
  const {hostname} = new URL(`https://${host}`)
  if (!isAllowedHerokuHostname(hostname)) throw new Error('HEROKU_HOST must be a Heroku or loopback host')
  const baseHost = host.replace(/^api\./, '')
  return {apiUrl: `https://api.${baseHost}`, gitHost: `git.${baseHost}`}
}

function credentialService(value: string | undefined, apiHost: string): string {
  if (value !== undefined) {
    if (!value || value.includes('\0')) throw new Error('credentialService must be nonempty and contain no NUL')
    return value
  }

  return apiHost === DEFAULT_API_HOST ? DEFAULT_CREDENTIAL_SERVICE : `${DEFAULT_CREDENTIAL_SERVICE}@${apiHost}`
}

function resolveConfig(config: LoginConfig, environment: LoginEnvironment): ResolvedConfig {
  const api = config.apiUrl === undefined ? configuredApi(environment) : {apiUrl: config.apiUrl}
  const configuredApiUrl = api.apiUrl
  const parsedApiUrl = safeEndpointUrl(configuredApiUrl, 'apiUrl')
  const apiUrl = parsedApiUrl.href.replace(/\/$/, '')
  const loginHost = safeEndpointUrl(config.loginHost ?? environment.get('HEROKU_LOGIN_HOST') ?? 'https://cli-auth.heroku.com', 'loginHost').href.replace(/\/$/, '')
  const configuredSsoUrl = config.ssoUrl ?? environment.get('SSO_URL')
  const configuredGitHost = config.gitHost ?? environment.get('HEROKU_GIT_HOST') ?? api.gitHost
  const apiHost = config.apiHost === undefined ? urlHost(configuredApiUrl, parsedApiUrl).toLowerCase() : safeHost(config.apiHost, 'apiHost')
  return {
    apiHost,
    apiUrl,
    credentialService: credentialService(config.credentialService, apiHost),
    dataDir: config.dataDir,
    gitHost: configuredGitHost === undefined ? undefined : safeHost(configuredGitHost, 'gitHost'),
    hostname: config.hostname ?? os.hostname(),
    loginHost,
    requestTimeoutMs: config.requestTimeoutMs,
    ssoUrl: configuredSsoUrl === undefined ? undefined : safeUrl(configuredSsoUrl, 'ssoUrl').href,
    timeoutMs: config.timeoutMs ?? LOGIN_TIMEOUT,
  }
}

function bodyRecord(error: LoginHttpError): Record<string, unknown> | undefined {
  return error.body && typeof error.body === 'object' ? error.body as Record<string, unknown> : undefined
}

function expected(error: unknown, resource?: 'authorization' | 'session'): boolean {
  if (!(error instanceof LoginHttpError)) return false
  if (error.status === 401) return true
  const body = bodyRecord(error)
  return resource !== undefined && error.status === 404 && body?.id === 'not_found' && body.resource === resource
}

function defaultRedactedTokenMatches(localToken: string, apiToken: string): boolean {
  const match = /^([^*]+)\*{10}([^*]+)$/.exec(apiToken)
  return Boolean(
    match
    && localToken.length >= match[1].length + REDACTED_TOKEN_ASTERISKS.length + match[2].length
    && localToken.startsWith(match[1])
    && localToken.endsWith(match[2]),
  )
}

function listedRedactedTokenMatches(localToken: string, apiToken: string): boolean {
  const match = /^([^*]+)\*{10}([^*]*)$/.exec(apiToken)
  return Boolean(
    match
    && localToken.length >= match[1].length + REDACTED_TOKEN_ASTERISKS.length + match[2].length
    && localToken.startsWith(match[1])
    && (!match[2] || localToken.endsWith(match[2])),
  )
}

function hasAsterisks(value: string): boolean {
  return value.includes('*')
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const header = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
  return header?.[1]
}

function requiredAuthEntry(value: unknown): asserts value is AuthEntry {
  if (!value || typeof value !== 'object') throw new Error('A valid auth entry is required')
  const candidate = value as Partial<AuthEntry>
  if (typeof candidate.account !== 'string' || !candidate.account.trim() || typeof candidate.token !== 'string' || !candidate.token.trim()) {
    throw new Error('A valid auth entry is required')
  }
}

function authorizationIds(authorizations: Authorization[], token: string): string[] {
  const exactIds = new Set<string>()
  for (const authorization of authorizations) {
    const apiToken = authorization?.access_token?.token
    if (apiToken !== token) continue
    if (typeof authorization.id !== 'string' || !authorization.id.trim()) {
      throw new Error('Login response did not include a matching authorization ID')
    }

    exactIds.add(authorization.id)
  }

  if (exactIds.size > 0) return [...exactIds]

  const redactedIds = new Set<string>()
  for (const authorization of authorizations) {
    const apiToken = authorization?.access_token?.token
    if (typeof apiToken !== 'string' || !listedRedactedTokenMatches(token, apiToken)) continue
    if (typeof authorization.id !== 'string' || !authorization.id.trim()) {
      throw new Error('Login response did not include a matching authorization ID')
    }

    redactedIds.add(authorization.id)
  }

  if (redactedIds.size > 1) throw new Error('Login response matched multiple redacted authorizations')
  return [...redactedIds]
}

function requiredMethod(value: unknown): LoginMethod {
  if (typeof value !== 'string' || !METHODS.has(value as LoginMethod)) {
    throw new Error('Invalid login method. Expected browser, interactive, or sso')
  }

  return value as LoginMethod
}

/**
 * Signals cancellation at the login-method prompt.
 * `interrupt` uses exit code 130; an explicit `quit` uses exit code 0.
 */
export class LoginCancelledError extends Error {
  exitCode: number
  reason: 'interrupt' | 'quit'

  constructor(reason: 'interrupt' | 'quit') {
    super('Login cancelled by user')
    this.exitCode = reason === 'interrupt' ? 130 : 0
    this.name = 'LoginCancelledError'
    this.reason = reason
  }
}

/**
 * Runs Heroku login and logout flows using injectable prompts, transport, storage, and other adapters.
 * Explicit endpoint and credential-host configuration is trusted after structural validation; callers must only
 * supply destinations they trust with credentials.
 */
export class Login {
  private readonly browser: LoginDependencies['browser']
  private readonly config: ResolvedConfig
  private readonly credentialHosts: string[]
  private readonly environment: LoginEnvironment
  private readonly http: NonNullable<LoginDependencies['http']>
  private readonly output: LoginOutput
  private readonly progress: LoginProgress
  private readonly prompt: LoginPrompt
  private readonly storage: LoginStorage
  private readonly timers: LoginTimers

  /**
   * Creates a client with the supplied adapters and trusted configuration, using package defaults when omitted.
   *
   * @param dependencies - Optional adapters and trusted configuration
   */
  constructor(dependencies: LoginDependencies = {}) {
    this.environment = dependencies.environment ?? defaultEnvironment
    this.config = resolveConfig(dependencies.config ?? {}, this.environment)
    this.credentialHosts = [...new Set([this.config.apiHost, this.config.gitHost].filter((host): host is string => host !== undefined))]
    this.http = dependencies.http ?? new FetchLoginHttp()
    this.output = dependencies.output ?? defaultOutput
    this.progress = dependencies.progress ?? defaultProgress
    this.prompt = dependencies.prompt ?? missingPrompt
    this.storage = dependencies.storage ?? defaultLoginStorage
    this.timers = dependencies.timers ?? defaultTimers
    this.browser = dependencies.browser
  }

  /**
   * Acquires and persists a credential, then returns its `{account, token}` entry.
   * The configured orchestration timeout covers acquisition only; persistence is awaited after acquisition and is
   * not cancelled by that timeout. Prompt cancellation rejects with {@link LoginCancelledError}; other acquisition
   * and persistence failures are propagated.
   *
   * @param options - Login method and method-specific options
   * @returns The persisted credential entry
   */
  async login(options: LoginOptions = {}): Promise<AuthEntry> {
    if (this.environment.get('HEROKU_API_KEY')) throw new Error('Cannot log in with HEROKU_API_KEY set')
    if (options.expiresIn && options.expiresIn > THIRTY_DAYS) {
      throw new Error('Cannot set an expiration longer than thirty days')
    }

    const controller = new AbortController()
    let acquiring = true
    let timerCleared = false
    let rejectTimeout: (error: Error) => void
    const timeout = new Promise<never>((_resolve, reject) => {
      rejectTimeout = reject
    })
    const timer = this.timers.setTimeout(() => {
      if (!acquiring) return
      const error = new Error('Login timed out')
      controller.abort(error)
      rejectTimeout(error)
    }, this.config.timeoutMs)
    const clearLoginTimer = () => {
      if (timerCleared) return
      timerCleared = true
      this.timers.clearTimeout(timer)
    }

    try {
      const acquisition = (async () => {
        const method = await this.selectMethod(options)
        return this.performLogin(method, options, controller.signal)
      })()
      const auth = await Promise.race([acquisition, timeout])
      if (controller.signal.aborted) throw controller.signal.reason
      acquiring = false
      clearLoginTimer()
      await this.persist(auth)
      return auth
    } finally {
      acquiring = false
      clearLoginTimer()
      this.progress.stop()
    }
  }

  /**
   * Requires the credential entry to revoke and attempts local API/Git credential cleanup alongside remote revocation.
   * The canonical credential service also attempts configured login-state cleanup; isolated custom services skip the
   * global login state. The timeout aborts remote work, but already-started local cleanup is still awaited. Cleanup uses
   * the entry token as a best-effort conditional safeguard and does not guarantee atomic cross-process removal.
   * Rejects when local cleanup or remote revocation fails, including a remote timeout.
   *
   * @param entry - Credential entry returned by login
   * @returns A promise that resolves after remote and local cleanup attempts finish
   */
  async logout(entry: AuthEntry): Promise<void> {
    requiredAuthEntry(entry)
    const controller = new AbortController()
    let rejectTimeout: (error: Error) => void
    const timeout = new Promise<never>((_resolve, reject) => {
      rejectTimeout = reject
    })
    const timer = this.timers.setTimeout(() => {
      const error = new Error('Logout timed out')
      controller.abort(error)
      rejectTimeout(error)
    }, this.config.timeoutMs)

    try {
      const cleanupSensitiveValues = this.authSensitiveValues(entry)
      const cleanup = [this.safeStorageOperation(
        () => this.storage.removeAuth(entry.account, this.credentialHosts, this.config.credentialService, entry.token),
        cleanupSensitiveValues,
      )]
      const {dataDir} = this.config
      if (dataDir && this.usesGlobalLoginState()) {
        cleanup.push(this.safeStorageOperation(
          () => this.storage.deleteLoginState(dataDir),
          cleanupSensitiveValues,
        ))
      }

      const localCleanup = Promise.allSettled(cleanup)
      const remoteCleanup = this.revoke(entry.token, controller.signal)
      const remoteResult = Promise.race([remoteCleanup, timeout])
        .then(() => ({status: 'fulfilled'} as const), error => ({reason: error, status: 'rejected'} as const))
      const [cleanupResults, settledRemoteResult] = await Promise.all([
        localCleanup,
        remoteResult,
      ] as const)
      const cleanupFailure = cleanupResults.find(result => result.status === 'rejected') as PromiseRejectedResult | undefined

      if (cleanupFailure) throw cleanupFailure.reason
      if (settledRemoteResult.status === 'rejected') throw settledRemoteResult.reason
    } finally {
      this.timers.clearTimeout(timer)
    }
  }

  private async authorizationCleanup(token: string, context: RequestContext): Promise<void> {
    const authorizations = await this.listAuthorizations(token, context)
    if (!authorizations) return
    const defaultToken = await this.defaultAuthorizationToken(token, context)
    if (defaultToken === undefined) return
    if (defaultToken === REDACTED_TOKEN_ASTERISKS || defaultToken === token || defaultRedactedTokenMatches(token, defaultToken)) return
    if (hasAsterisks(defaultToken)) throw new Error('Login response included an invalid default authorization token mask')

    const identifiers = authorizationIds(authorizations, token)
    const results = await Promise.allSettled(identifiers.map(async id => {
      const encodedId = encodeURIComponent(id)
      try {
        await checkedRequest<unknown>(
          this.http,
          `${this.config.apiUrl}/oauth/authorizations/${encodedId}`,
          requestOptions(context, 'DELETE', {headers: bearerHeaders(token)}),
          [token, `Bearer ${token}`, id, encodedId],
        )
      } catch (error) {
        const normalized = normalizeLoginHttpError(error)
        if (!(normalized instanceof LoginHttpError) || normalized.status !== 401) throw normalized
      }
    }))
    const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult | undefined
    if (failure) throw normalizeLoginHttpError(failure.reason)
  }

  private authSensitiveValues(entry?: AuthEntry): string[] {
    const combinedCredential = entry?.account && entry.token ? `${entry.account}:${entry.token}` : ''
    return [
      entry?.account ?? '',
      entry?.token ?? '',
      entry?.token ? `Bearer ${entry.token}` : '',
      combinedCredential,
    ]
  }

  private async defaultAuthorizationToken(token: string, context: RequestContext): Promise<string | undefined> {
    try {
      const response = await checkedRequest<{access_token?: {token?: unknown}}>(
        this.http,
        `${this.config.apiUrl}/oauth/authorizations/~`,
        requestOptions(context, 'GET', {headers: bearerHeaders(token)}),
        [token, `Bearer ${token}`],
      )
      if (typeof response.body?.access_token?.token !== 'string' || !response.body.access_token.token.trim()) {
        throw new Error('Login response did not include a default authorization token')
      }

      return response.body.access_token.token
    } catch (error) {
      const normalized = normalizeLoginHttpError(error)
      if (normalized instanceof LoginHttpError && normalized.status === 401) {
        throw new Error('Remote authorization revocation may be incomplete because the default authorization could not be verified')
      }

      if (expected(normalized, 'authorization')) return ''
      throw normalized
    }
  }

  private async listAuthorizations(token: string, context: RequestContext): Promise<Authorization[] | undefined> {
    const authorizations: Authorization[] = []
    const ranges = new Set<string>()
    let range: string | undefined
    try {
      for (let page = 0; ; page++) {
        if (page >= MAX_AUTHORIZATION_PAGES) throw new Error(`Authorization pagination exceeded ${MAX_AUTHORIZATION_PAGES} pages`)
        const headers = bearerHeaders(token)
        if (range !== undefined) headers.Range = range
        // Pagination must remain sequential so no authorization is deleted from a partial snapshot.
        // eslint-disable-next-line no-await-in-loop
        const response = await checkedRequest<unknown>(this.http, `${this.config.apiUrl}/oauth/authorizations`, requestOptions(context, 'GET', {
          headers,
        }), [token, `Bearer ${token}`])
        if (!Array.isArray(response.body)) throw new Error('Login response did not include an authorization list')
        authorizations.push(...response.body as Authorization[])

        if (response.status !== 206) break
        const nextRange = headerValue(response.headers, 'Next-Range')
        if (!nextRange?.trim()) throw new Error('Invalid authorization pagination: 206 response did not include Next-Range')
        if (ranges.has(nextRange)) throw new Error('Invalid authorization pagination: repeated Next-Range')
        ranges.add(nextRange)
        range = nextRange
      }
    } catch (error) {
      const normalized = normalizeLoginHttpError(error)
      if (normalized instanceof LoginHttpError && normalized.status === 401) {
        if (range === undefined && authorizations.length === 0) return
        throw new Error('Remote authorization revocation may be incomplete because the authorization list could not be fully enumerated')
      }

      throw normalized
    }

    return authorizations
  }

  private async performLogin(method: LoginMethod, options: LoginOptions, signal: AbortSignal): Promise<AuthEntry> {
    const context: RequestContext = {http: this.http, requestTimeoutMs: this.config.requestTimeoutMs, signal}
    switch (method) {
    case 'browser': {
      return browserLogin(context, {
        apiUrl: this.config.apiUrl,
        browser: this.browser,
        browserName: options.browser,
        environment: this.environment,
        hostname: this.config.hostname,
        loginHost: this.config.loginHost,
        output: this.output,
        progress: this.progress,
      })
    }

    case 'interactive': {
      return interactiveLogin(context, {
        apiUrl: this.config.apiUrl,
        expiresIn: options.expiresIn,
        hostname: this.config.hostname,
        previousAccount: await this.previousAccount(),
        prompt: this.prompt,
      })
    }

    case 'sso': {
      return ssoLogin(context, {
        apiUrl: this.config.apiUrl,
        browser: this.browser,
        defaultOrganization: this.environment.get('HEROKU_ORGANIZATION'),
        output: this.output,
        progress: this.progress,
        prompt: this.prompt,
        ssoUrl: this.config.ssoUrl,
      })
    }
    }
  }

  private async persist(auth: AuthEntry): Promise<void> {
    const sensitiveValues = this.authSensitiveValues(auth)
    await this.safeStorageOperation(
      () => this.storage.saveAuth(auth.account, auth.token, this.credentialHosts, this.config.credentialService),
      sensitiveValues,
    )
    const {dataDir} = this.config
    if (dataDir && this.usesGlobalLoginState() && this.storage.hasNativeStorage()) {
      await this.safeStorageOperation(
        () => this.storage.writeLoginState(dataDir, auth.account),
        sensitiveValues,
      )
    }
  }

  private async previousAccount(): Promise<string | undefined> {
    let account: string | undefined
    try {
      if (this.config.dataDir && this.usesGlobalLoginState() && this.storage.hasNativeStorage()) {
        account = (await this.storage.readLoginState(this.config.dataDir))?.account.trim() || undefined
      }

      return (await this.storage.getAuth(account, this.config.apiHost, this.config.credentialService)).account.trim() || account
    } catch {
      return account
    }
  }

  private async revoke(token: string, signal: AbortSignal): Promise<void> {
    const context: RequestContext = {http: this.http, requestTimeoutMs: this.config.requestTimeoutMs, signal}
    const session = (async () => {
      try {
        await checkedRequest<unknown>(this.http, `${this.config.apiUrl}/oauth/sessions/~`, requestOptions(context, 'DELETE', {
          headers: bearerHeaders(token),
        }), [token, `Bearer ${token}`])
      } catch (error) {
        const normalized = normalizeLoginHttpError(error)
        if (!expected(normalized, 'session')) throw normalized
      }
    })()
    const authorizations = this.authorizationCleanup(token, context)
    const results = await Promise.allSettled([session, authorizations])
    const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult | undefined
    if (failure) throw failure.reason
  }

  private async safeStorageOperation(operation: () => Promise<void>, sensitiveValues: readonly string[]): Promise<void> {
    try {
      await operation()
    } catch (error) {
      throw sanitizePublicError(error, sensitiveValues, {preserveCause: false, preserveHttpDetails: false})
    }
  }

  private async selectMethod(options: LoginOptions): Promise<LoginMethod> {
    if (options.method !== undefined) return requiredMethod(options.method)
    if (options.expiresIn) return 'interactive'
    if (this.environment.get('HEROKU_LEGACY_SSO') === '1') return 'sso'

    const selection = await this.prompt.loginMethod()
    if ('cancelled' in selection) throw new LoginCancelledError(selection.cancelled)
    return requiredMethod(selection.method)
  }

  private usesGlobalLoginState(): boolean {
    return this.config.credentialService === DEFAULT_CREDENTIAL_SERVICE
  }
}

export {LoginHttpError} from './http.js'
export type {
  LoginBrowser,
  LoginConfig,
  LoginDependencies,
  LoginEnvironment,
  LoginHttp,
  LoginHttpRequest,
  LoginHttpResponse,
  LoginMethod,
  LoginOptions,
  LoginOutput,
  LoginProgress,
  LoginPrompt,
  LoginPromptSelection,
  LoginResult,
  LoginStorage,
  LoginTimers,
} from './types.js'
