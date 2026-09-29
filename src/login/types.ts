import type {AuthEntry} from '../lib/types.js'

/** Login flow supported by {@link LoginOptions.method}. */
export type LoginMethod = 'browser' | 'interactive' | 'sso'

/** Options for one login attempt. */
export type LoginOptions = {
  /** Browser executable or application name passed to the injected browser opener. */
  browser?: string
  /** Requested OAuth authorization lifetime in seconds. */
  expiresIn?: number
  /** Login flow to run. When omitted, the prompt or environment selects the flow. */
  method?: LoginMethod
}

/** Account and token persisted by a successful login. */
export type LoginResult = AuthEntry

/** Options shared by Heroku Platform API requests. */
export type HerokuApiRequestOptions = {
  /** Request headers. */
  headers?: Record<string, string>
  /** Signal for cancellation of login or logout orchestration. */
  signal?: AbortSignal
  /** Timeout for this individual HTTP request, in milliseconds. */
  timeoutMs?: number
}

/** Normalized response returned by the injected Heroku Platform API client. */
export type HerokuApiResponse<T> = {
  /** Parsed response body, when one is returned. */
  body: T
  /** Response headers keyed by lower-case header name. */
  headers: Record<string, string | string[] | undefined>
  /** HTTP response status code. */
  status: number
}

/** Package-local shape required from a Heroku Platform API client. */
export interface HerokuApiClientLike {
  /** Deletes a Platform API resource. */
  delete<T>(path: string, options?: HerokuApiRequestOptions): Promise<HerokuApiResponse<T>>
  /** Gets a Platform API resource. */
  get<T>(path: string, options?: HerokuApiRequestOptions): Promise<HerokuApiResponse<T>>
}

/** Fetch-compatible function used for OAuth POSTs and non-Platform HTTP requests. */
export type FetchLike = (input: Request | string | URL, init?: RequestInit) => Promise<Response>

/** Result from the login-method prompt. */
export type LoginPromptSelection
  = | {cancelled: 'interrupt' | 'quit'}
  | {method: 'browser'}

/** Semantic prompts required by interactive login flows. */
export interface LoginPrompt {
  /** Prompts for an existing access token during legacy SSO login. */
  accessToken(): Promise<string>
  /** Prompts for an account email, optionally prefilled with the previously selected account. */
  email(previousAccount?: string): Promise<string>
  /** Prompts for browser login or cancellation. */
  loginMethod(): Promise<LoginPromptSelection>
  /** Prompts for an SSO organization, optionally with a default. */
  organization(defaultOrganization?: string): Promise<string>
  /** Prompts for an account password. */
  password(): Promise<string>
  /** Prompts for a two-factor code. */
  secondFactor(): Promise<string>
}

/** Injectable browser launcher. */
export interface LoginBrowser {
  /** Opens a complete login URL, optionally with a requested browser application. */
  open(url: string, options?: {browser?: string}): Promise<void>
}

/** Injectable user-facing login output. */
export interface LoginOutput {
  /** Writes a warning without failing the login flow. */
  warn(message: string): void
  /** Writes informational output such as a manual browser URL. */
  write(message: string): void
}

/** Injectable progress indicator. */
export interface LoginProgress {
  /** Starts progress output with the supplied message. */
  start(message: string): void
  /** Stops progress output. */
  stop(): void
}

/** Injectable timer implementation used for orchestration timeouts. */
export interface LoginTimers {
  /** Clears a timer returned by {@link LoginTimers.setTimeout}. */
  clearTimeout(timer: unknown): void
  /** Schedules a timeout and returns its implementation-specific handle. */
  setTimeout(handler: () => void, timeoutMs: number): unknown
}

/** Injectable environment-variable reader. */
export interface LoginEnvironment {
  /** Returns the value of an environment variable, if set. */
  get(name: string): string | undefined
}

/** Credential and account-selection persistence used by login and logout. */
export interface LoginStorage {
  /** Best-effort removal of the native account-selection state. */
  deleteLoginState(dataDir: string): Promise<void>
  /**
   * Resolves credentials for `account`, falling back to the netrc entry for `host`.
   * With `account` undefined, lookup is directly by netrc host and returns its login.
   * `service` selects the native credential namespace and defaults to the package's canonical service.
   */
  getAuth(account: string | undefined, host: string, service?: string): Promise<AuthEntry>
  /**
   * Reports whether native storage is actively selected, not merely available.
   * False prevents native login persistence and login.json reads/writes, including in forced-netrc mode.
   * Logout and top-level `removeAuth` may still attempt OS-native cleanup of stale credentials.
   */
  hasNativeStorage(): boolean
  /** Reads the account-selection state associated with native credential storage. */
  readLoginState(dataDir: string): Promise<undefined | {account: string}>
  /**
   * Attempts to remove credentials for the account and hosts in the optional native service namespace.
   * `expectedToken` is a best-effort snapshot safeguard: implementations should compare it when supported before
   * removal, but whether comparison and removal are atomic is adapter-specific.
   * Implementations may perform best-effort removal, so resolution does not guarantee every backing store was changed.
   */
  removeAuth(account: string | undefined, hosts: string[], service?: string, expectedToken?: string): Promise<void>
  /** Saves credentials for the account and trusted API/Git hosts in the optional native service namespace. */
  saveAuth(account: string, token: string, hosts: string[], service?: string): Promise<void>
  /** Writes the account-selection state used with native credential storage. */
  writeLoginState(dataDir: string, account: string): Promise<void>
}

/** Trusted endpoints and timing behavior for login and logout. */
export type LoginConfig = {
  /**
   * Trusted credential lookup/storage host for the API, with optional port.
   * Defaults to the host derived from `apiUrl`.
   */
  apiHost?: string
  /**
   * Trusted API base URL. It must be absolute HTTPS (HTTP is allowed only for loopback) and must not include credentials.
   * Supply a base URL without a query or fragment; login appends API paths to this value. A path prefix is allowed.
   */
  apiUrl?: string
  /**
   * Native credential-store service namespace. Defaults to `heroku-cli` for `api.heroku.com`; other API hosts derive
   * `heroku-cli@<normalized apiHost>`, including an explicit port. A custom value must be nonempty and contain no NUL.
   * Services other than `heroku-cli` do not use the global native `login.json` account-selection state.
   */
  credentialService?: string
  /** Directory containing native credential account-selection state. */
  dataDir?: string
  /**
   * Trusted Git credential host, with optional port. It is distinct from `apiHost` and receives the same credential.
   * A custom `apiUrl` does not imply a Git host; set this explicitly to opt in to Git credential storage.
   */
  gitHost?: string
  /** Hostname included in OAuth authorization descriptions. */
  hostname?: string
  /**
   * Trusted browser-login service base URL. It must be absolute HTTPS (HTTP only for loopback), without query or fragment.
   * A path prefix is allowed.
   */
  loginHost?: string
  /** Timeout in milliseconds applied independently to each HTTP request. */
  requestTimeoutMs?: number
  /**
   * Complete trusted legacy SSO URL to open, rather than a base URL to which paths are appended.
   * It must be absolute HTTPS (HTTP only for loopback) and may include the complete path, query, and fragment.
   */
  ssoUrl?: string
  /**
   * Login acquisition timeout in milliseconds, excluding non-cancellable credential persistence after acquisition.
   * For logout, the same value is the remote-revocation deadline. Already-started, non-cancellable local cleanup is
   * still awaited, so logout can remain pending indefinitely if local cleanup never settles.
   */
  timeoutMs?: number
}

/** Adapters and trusted configuration used to construct a login client. */
export type LoginDependencies = {
  /** Constructs a Heroku Platform API client authenticated with the operation token. */
  apiClientForToken(token: string): HerokuApiClientLike
  /** Browser launcher. Browser-open failures remain non-fatal because manual URLs are emitted. */
  browser?: LoginBrowser
  /** Trusted endpoint, persistence-directory, and timeout configuration. */
  config?: LoginConfig
  /** Environment-variable reader. */
  environment?: LoginEnvironment
  /** Fetch implementation for OAuth POSTs and non-Platform HTTP requests. */
  fetch?: FetchLike
  /** User-facing output. */
  output?: LoginOutput
  /** Progress indicator. */
  progress?: LoginProgress
  /** Semantic login prompts. */
  prompt?: LoginPrompt
  /** Credential and native account-selection storage. */
  storage?: LoginStorage
  /** Timer implementation for login and logout orchestration. */
  timers?: LoginTimers
}
