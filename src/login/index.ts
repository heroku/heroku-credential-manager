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
const REDACTED_TOKEN_ASTERISKS = '*'.repeat(10)
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

type ResolvedConfig = Pick<LoginConfig, 'dataDir' | 'requestTimeoutMs' | 'ssoUrl'>
  & Required<Pick<LoginConfig, 'apiHost' | 'apiUrl' | 'gitHost' | 'hostname' | 'loginHost' | 'timeoutMs'>>

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

function safeHost(value: string, description: string): string {
  if (!value || /[\s\0#/?@\\]/.test(value)) throw new Error(`${description} must be a non-empty host with an optional port`)
  const authority = /^(?:\[[^\]]+]|[^:]+)(?::\d+)?$/
  if (!authority.test(value)) throw new Error(`${description} must be a non-empty host with an optional port`)
  try {
    const parsed = new URL(`https://${value}`)
    if (urlHost(`https://${value}`, parsed) !== value || parsed.pathname !== '/' || parsed.username || parsed.password) {
      throw new Error('Invalid host')
    }
  } catch {
    throw new Error(`${description} must be a non-empty host with an optional port`)
  }

  return value
}

function urlHost(value: string, url: URL): string {
  const authority = value.match(/^[a-z][\d+.a-z-]*:\/\/([^#/?]*)/i)?.[1]
  const port = authority?.match(/(?:]|[^:]):(\d+)$/)?.[1]
  return port ? `${url.hostname}:${port}` : url.host
}

function configuredApi(environment: LoginEnvironment): {apiUrl: string, gitHost?: string} {
  const configuredApiUrl = environment.get('HEROKU_API_URL')
  if (configuredApiUrl) {
    const url = safeUrl(configuredApiUrl, 'HEROKU_API_URL')
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

function resolveConfig(config: LoginConfig, environment: LoginEnvironment): ResolvedConfig {
  const api = config.apiUrl === undefined ? configuredApi(environment) : {apiUrl: config.apiUrl}
  const configuredApiUrl = api.apiUrl
  const parsedApiUrl = safeUrl(configuredApiUrl, 'apiUrl')
  const apiUrl = parsedApiUrl.href.replace(/\/$/, '')
  const loginHost = safeUrl(config.loginHost ?? environment.get('HEROKU_LOGIN_HOST') ?? 'https://cli-auth.heroku.com', 'loginHost').href.replace(/\/$/, '')
  const configuredSsoUrl = config.ssoUrl ?? environment.get('SSO_URL')
  return {
    apiHost: config.apiHost === undefined ? urlHost(configuredApiUrl, parsedApiUrl) : safeHost(config.apiHost, 'apiHost'),
    apiUrl,
    dataDir: config.dataDir,
    gitHost: safeHost(config.gitHost ?? environment.get('HEROKU_GIT_HOST') ?? api.gitHost ?? 'git.heroku.com', 'gitHost'),
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

function tokenMatches(localToken: string, apiToken: string): boolean {
  const asteriskIndex = apiToken.indexOf(REDACTED_TOKEN_ASTERISKS)
  if (asteriskIndex === -1) return localToken === apiToken
  const prefix = apiToken.slice(0, asteriskIndex)
  const suffix = apiToken.slice(asteriskIndex + REDACTED_TOKEN_ASTERISKS.length)
  if (!prefix && !suffix) return false
  return localToken.startsWith(prefix) && (suffix === '' || localToken.endsWith(suffix))
}

function requiredMethod(value: unknown): LoginMethod {
  if (typeof value !== 'string' || !METHODS.has(value as LoginMethod)) {
    throw new Error('Invalid login method. Expected browser, interactive, or sso')
  }

  return value as LoginMethod
}

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

export class Login {
  private readonly browser: LoginDependencies['browser']
  private readonly config: ResolvedConfig
  private readonly environment: LoginEnvironment
  private readonly http: NonNullable<LoginDependencies['http']>
  private readonly output: LoginOutput
  private readonly progress: LoginProgress
  private readonly prompt: LoginPrompt
  private readonly storage: LoginStorage
  private readonly timers: LoginTimers

  constructor(dependencies: LoginDependencies = {}) {
    this.environment = dependencies.environment ?? defaultEnvironment
    this.config = resolveConfig(dependencies.config ?? {}, this.environment)
    this.http = dependencies.http ?? new FetchLoginHttp()
    this.output = dependencies.output ?? defaultOutput
    this.progress = dependencies.progress ?? defaultProgress
    this.prompt = dependencies.prompt ?? missingPrompt
    this.storage = dependencies.storage ?? defaultLoginStorage
    this.timers = dependencies.timers ?? defaultTimers
    this.browser = dependencies.browser
  }

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

  async logout(entry?: AuthEntry): Promise<void> {
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
    let accountHint: string | undefined

    try {
      let resolvedEntry = entry
      let resolutionTimedOut = false
      if (!resolvedEntry) {
        try {
          resolvedEntry = await Promise.race([
            this.resolveLogoutEntry(account => {
              accountHint = account
            }),
            timeout,
          ])
        } catch (error) {
          if (controller.signal.aborted && error === controller.signal.reason) resolutionTimedOut = true
        }
      }

      const cleanupSensitiveValues = this.authSensitiveValues(resolvedEntry, accountHint)
      const cleanup = [this.safeStorageOperation(
        () => this.storage.removeAuth(resolvedEntry?.account ?? accountHint, [this.config.apiHost, this.config.gitHost]),
        cleanupSensitiveValues,
      )]
      const {dataDir} = this.config
      if (dataDir) {
        cleanup.push(this.safeStorageOperation(
          () => this.storage.deleteLoginState(dataDir),
          cleanupSensitiveValues,
        ))
      }

      const localCleanup = Promise.allSettled(cleanup)
      let remoteCleanup = Promise.resolve()
      if (!resolutionTimedOut && resolvedEntry?.token) remoteCleanup = this.revoke(resolvedEntry.token, controller.signal)
      const cleanupResult = Promise.all([
        localCleanup,
        remoteCleanup.then(() => ({status: 'fulfilled'} as const), error => ({reason: error, status: 'rejected'} as const)),
      ] as const)
      const [cleanupResults, remoteResult] = await Promise.race([cleanupResult, timeout])
      const cleanupFailure = cleanupResults.find(result => result.status === 'rejected') as PromiseRejectedResult | undefined

      if (cleanupFailure) throw cleanupFailure.reason
      if (remoteResult.status === 'rejected') throw remoteResult.reason
    } finally {
      this.timers.clearTimeout(timer)
    }
  }

  private async authorizationCleanup(token: string, context: RequestContext): Promise<void> {
    let authorizations: Array<{access_token?: {token?: unknown}, id?: unknown}>
    try {
      const response = await checkedRequest<unknown>(this.http, `${this.config.apiUrl}/oauth/authorizations`, requestOptions(context, 'GET', {
        headers: bearerHeaders(token),
      }), [token, `Bearer ${token}`])
      if (!Array.isArray(response.body)) throw new Error('Login response did not include an authorization list')
      authorizations = response.body
    } catch (error) {
      const normalized = normalizeLoginHttpError(error)
      if (expected(normalized)) return
      throw normalized
    }

    let defaultToken: string | undefined
    try {
      const response = await checkedRequest<{access_token?: {token?: unknown}}>(
        this.http,
        `${this.config.apiUrl}/oauth/authorizations/~`,
        requestOptions(context, 'GET', {headers: bearerHeaders(token)}),
        [token, `Bearer ${token}`],
      )
      if (typeof response.body?.access_token?.token === 'string') defaultToken = response.body.access_token.token
    } catch (error) {
      const normalized = normalizeLoginHttpError(error)
      if (!expected(normalized, 'authorization')) throw normalized
    }

    if (defaultToken === REDACTED_TOKEN_ASTERISKS || (defaultToken && tokenMatches(token, defaultToken))) return
    const identifiers = authorizations
      .filter(auth => typeof auth.id === 'string' && typeof auth.access_token?.token === 'string' && tokenMatches(token, auth.access_token.token))
      .map(auth => auth.id as string)

    const results = await Promise.allSettled(identifiers.map(async id => {
      const encodedId = encodeURIComponent(id)
      await checkedRequest<unknown>(
        this.http,
        `${this.config.apiUrl}/oauth/authorizations/${encodedId}`,
        requestOptions(context, 'DELETE', {headers: bearerHeaders(token)}),
        [token, `Bearer ${token}`, id, encodedId],
      )
    }))
    const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult | undefined
    if (failure) throw normalizeLoginHttpError(failure.reason)
  }

  private authSensitiveValues(entry?: AuthEntry, accountHint?: string): string[] {
    const combinedCredential = entry?.account && entry.token ? `${entry.account}:${entry.token}` : ''
    return [
      entry?.account ?? '',
      entry?.token ?? '',
      entry?.token ? `Bearer ${entry.token}` : '',
      combinedCredential,
      accountHint ?? '',
    ]
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
      () => this.storage.saveAuth(auth.account, auth.token, [this.config.apiHost, this.config.gitHost]),
      sensitiveValues,
    )
    const {dataDir} = this.config
    if (dataDir && this.storage.hasNativeStorage()) {
      await this.safeStorageOperation(
        () => this.storage.writeLoginState(dataDir, auth.account),
        sensitiveValues,
      )
    }
  }

  private async previousAccount(): Promise<string | undefined> {
    let account: string | undefined
    try {
      if (this.config.dataDir && this.storage.hasNativeStorage()) {
        account = (await this.storage.readLoginState(this.config.dataDir))?.account.trim() || undefined
      }

      return (await this.storage.getAuth(account, this.config.apiHost)).account.trim() || account
    } catch {
      return account
    }
  }

  private async resolveLogoutEntry(onAccount: (account: string) => void): Promise<AuthEntry | undefined> {
    let account: string | undefined
    try {
      if (this.config.dataDir && this.storage.hasNativeStorage()) {
        account = (await this.storage.readLoginState(this.config.dataDir))?.account.trim() || undefined
        if (account) onAccount(account)
      }
    } catch {}

    try {
      return await this.storage.getAuth(account, this.config.apiHost)
    } catch {
      return account ? {account, token: ''} : undefined
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
