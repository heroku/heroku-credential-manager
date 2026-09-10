import type {AuthEntry} from '../lib/types.js'

export type LoginMethod = 'browser' | 'interactive' | 'sso'

export type LoginOptions = {
  browser?: string
  expiresIn?: number
  method?: LoginMethod
}

export type LoginResult = AuthEntry

export type LoginHttpRequest = {
  body?: unknown
  headers?: Record<string, string>
  method: 'DELETE' | 'GET' | 'POST'
  signal?: AbortSignal
  timeoutMs?: number
}

export type LoginHttpResponse<T> = {
  body: T
  headers: Record<string, string>
  ok: boolean
  status: number
}

export interface LoginHttp {
  request<T>(url: string, options: LoginHttpRequest): Promise<LoginHttpResponse<T>>
}

export type LoginPromptSelection =
  | {cancelled: 'interrupt' | 'quit'}
  | {method: 'browser'}

export interface LoginPrompt {
  accessToken(): Promise<string>
  email(previousAccount?: string): Promise<string>
  loginMethod(): Promise<LoginPromptSelection>
  organization(defaultOrganization?: string): Promise<string>
  password(): Promise<string>
  secondFactor(): Promise<string>
}

export interface LoginBrowser {
  open(url: string, options?: {browser?: string}): Promise<void>
}

export interface LoginOutput {
  warn(message: string): void
  write(message: string): void
}

export interface LoginProgress {
  start(message: string): void
  stop(): void
}

export interface LoginTimers {
  clearTimeout(timer: unknown): void
  setTimeout(handler: () => void, timeoutMs: number): unknown
}

export interface LoginEnvironment {
  get(name: string): string | undefined
}

export interface LoginStorage {
  deleteLoginState(dataDir: string): Promise<void>
  getAuth(account: string | undefined, host: string): Promise<AuthEntry>
  hasNativeStorage(): boolean
  readLoginState(dataDir: string): Promise<{account: string} | undefined>
  removeAuth(account: string | undefined, hosts: string[]): Promise<void>
  saveAuth(account: string, token: string, hosts: string[]): Promise<void>
  writeLoginState(dataDir: string, account: string): Promise<void>
}

export type LoginConfig = {
  apiHost?: string
  apiUrl?: string
  dataDir?: string
  gitHost?: string
  hostname?: string
  loginHost?: string
  requestTimeoutMs?: number
  ssoUrl?: string
  timeoutMs?: number
}

export type LoginDependencies = {
  browser?: LoginBrowser
  config?: LoginConfig
  environment?: LoginEnvironment
  http?: LoginHttp
  output?: LoginOutput
  progress?: LoginProgress
  prompt?: LoginPrompt
  storage?: LoginStorage
  timers?: LoginTimers
}
