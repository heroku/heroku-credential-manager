import {expect, use} from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinon from 'sinon'

import type {
  LoginBrowser,
  LoginDependencies,
  LoginEnvironment,
  LoginHttp,
  LoginHttpRequest,
  LoginHttpResponse,
  LoginOutput,
  LoginProgress,
  LoginPrompt,
  LoginPromptSelection,
  LoginStorage,
  LoginTimers,
} from '../../src/login/index.js'

import {Login, LoginCancelledError, LoginHttpError} from '../../src/login/index.js'

/* eslint-disable camelcase, mocha/max-top-level-suites, no-await-in-loop, unicorn/consistent-function-scoping */

use(chaiAsPromised)

type Request = {options: LoginHttpRequest, url: string}
type TimerHandler = () => void

class FakeHttp implements LoginHttp {
  requests: Request[] = []
  responses: Array<Error | LoginHttpResponse<unknown>> = []

  async request<T>(url: string, options: LoginHttpRequest): Promise<LoginHttpResponse<T>> {
    this.requests.push({options, url})
    const response = this.responses.shift()
    if (response instanceof Error) throw response
    if (!response) throw new Error(`Unexpected request: ${options.method} ${url}`)
    return response as LoginHttpResponse<T>
  }
}

function response<T>(body: T, status = 200, headers: Record<string, string> = {}): LoginHttpResponse<T> {
  return {
    body, headers, ok: status >= 200 && status < 300, status,
  }
}

function environment(values: Record<string, string | undefined> = {}): LoginEnvironment {
  return {get: name => values[name]}
}

function prompt(overrides: Partial<LoginPrompt> = {}): LoginPrompt {
  return {
    accessToken: async () => 'sso-token',
    email: async () => 'jöhn@example.com',
    loginMethod: async () => ({method: 'browser'}),
    organization: async () => 'example org',
    password: async () => 'pässword',
    secondFactor: async () => '123456',
    ...overrides,
  }
}

function storage(overrides: Partial<LoginStorage> = {}): LoginStorage {
  return {
    async deleteLoginState() {},
    getAuth: async account => ({account: account ?? 'stored@example.com', token: 'stored-token'}),
    hasNativeStorage: () => false,
    async readLoginState() {
      return {} as {account: string} | undefined
    },
    async removeAuth() {},
    async saveAuth() {},
    async writeLoginState() {},
    ...overrides,
  }
}

function output(): {messages: string[], warnings: string[]} & LoginOutput {
  const messages: string[] = []
  const warnings: string[] = []
  return {
    messages, warn: message => warnings.push(message), warnings, write: message => messages.push(message),
  }
}

function progress(): {starts: string[], stops: number} & LoginProgress {
  const result = {
    start(message: string) {
      result.starts.push(message)
    },
    starts: [] as string[],
    stop() {
      result.stops++
    },
    stops: 0,
  }
  return result
}

function fakeTimers(): {cleared: number, fire(): void, pending: number} & LoginTimers {
  const handlers = new Map<unknown, TimerHandler>()
  const result = {
    clearTimeout(timer: unknown) {
      result.cleared++
      handlers.delete(timer)
    },
    cleared: 0,
    fire() {
      const next = handlers.entries().next().value as [unknown, TimerHandler] | undefined
      if (!next) return
      handlers.delete(next[0])
      next[1]()
    },
    get pending() {
      return handlers.size
    },
    setTimeout(next: () => void) {
      const handle = {}
      handlers.set(handle, next)
      return handle
    },
  }
  return result
}

function loginFixture(overrides: LoginDependencies = {}) {
  const http = overrides.http ?? new FakeHttp()
  const loginOutput = overrides.output ?? output()
  const loginProgress = overrides.progress ?? progress()
  const loginStorage = overrides.storage ?? storage()
  const timers = overrides.timers ?? fakeTimers()
  const login = new Login({
    config: {
      apiHost: 'api.heroku.test',
      apiUrl: 'https://api.heroku.test',
      credentialService: 'heroku-cli',
      dataDir: '/fixture/data',
      gitHost: 'git.heroku.test',
      hostname: 'fixture-host',
      loginHost: 'https://login.heroku.test',
      timeoutMs: 100,
    },
    environment: environment(),
    output: loginOutput,
    progress: loginProgress,
    prompt: prompt(),
    storage: loginStorage,
    timers,
    ...overrides,
    http,
  })
  return {
    http: http as FakeHttp, login, output: loginOutput, progress: loginProgress, storage: loginStorage, timers,
  }
}

function queueInteractive(http: FakeHttp, account = 'jöhn@example.com', token = 'new-token') {
  http.responses.push(response({access_token: {token}, user: {email: account}}))
}

function expectSafeErrorSurface(error: Error, sensitiveValues: readonly string[]): void {
  const inspected: string[] = []
  const seen = new Set<Error>()
  let current: unknown = error
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current)
    inspected.push(String(current), JSON.stringify(current), current.message, current.name)
    for (const key of Object.keys(current)) inspected.push(String((current as unknown as Record<string, unknown>)[key]))
    current = current.cause
  }

  if (typeof current === 'string') inspected.push(current)
  const surface = inspected.join('\n')
  for (const value of sensitiveValues) {
    expect(surface).to.not.include(value)
    expect(surface).to.not.include(Buffer.from(value, 'utf8').toString('base64'))
  }
}

describe('Login', function () {
  describe('selection and validation', function () {
    it('refuses HEROKU_API_KEY before prompts, storage, or HTTP mutation', async function () {
      const method = sinon.stub().resolves({method: 'browser'} as LoginPromptSelection)
      const saveAuth = sinon.stub().resolves()
      const {http, login} = loginFixture({
        environment: environment({HEROKU_API_KEY: 'secret'}),
        prompt: prompt({loginMethod: method}),
        storage: storage({saveAuth}),
      })

      await expect(login.login()).to.be.rejectedWith('Cannot log in with HEROKU_API_KEY set')
      expect(method.notCalled).to.be.true
      expect(saveAuth.notCalled).to.be.true
      expect(http.requests).to.deep.equal([])
    })

    it('refuses expiration longer than thirty days before mutation', async function () {
      const saveAuth = sinon.stub().resolves()
      const {http, login} = loginFixture({storage: storage({saveAuth})})
      await expect(login.login({expiresIn: 60 * 60 * 24 * 31})).to.be.rejectedWith('Cannot set an expiration longer than thirty days')
      expect(saveAuth.notCalled).to.be.true
      expect(http.requests).to.deep.equal([])
    })

    it('uses explicit method before expiresIn and legacy SSO', async function () {
      const {http, login} = loginFixture({environment: environment({HEROKU_LEGACY_SSO: '1'})})
      queueInteractive(http)
      await login.login({expiresIn: 123, method: 'interactive'})
      expect(http.requests[0].url).to.equal('https://api.heroku.test/oauth/authorizations')
    })

    it('uses interactive for truthy expiresIn before legacy SSO', async function () {
      const {http, login} = loginFixture({environment: environment({HEROKU_LEGACY_SSO: '1'})})
      queueInteractive(http)
      await login.login({expiresIn: 123})
      expect(http.requests[0].options.body).to.include({expires_in: 123})
    })

    it('uses legacy SSO when configured', async function () {
      const {http, login} = loginFixture({environment: environment({HEROKU_LEGACY_SSO: '1', SSO_URL: 'https://sso.test/login'})})
      http.responses.push(response({email: 'sso@example.com'}))
      expect(await login.login()).to.deep.equal({account: 'sso@example.com', token: 'sso-token'})
    })

    it('maps quit and Ctrl-C cancellations without HTTP or persistence', async function () {
      for (const [reason, exitCode] of [['quit', 0], ['interrupt', 130]] as const) {
        const {http, login} = loginFixture({prompt: prompt({loginMethod: async () => ({cancelled: reason})})})
        const error = await login.login().then(() => {
          throw new Error('Expected cancellation')
        }, error => error as LoginCancelledError)
        expect(error).to.be.instanceOf(LoginCancelledError)
        expect(error.reason).to.equal(reason)
        expect(error.exitCode).to.equal(exitCode)
        expect(http.requests).to.deep.equal([])
      }
    })

    it('times out while waiting for login method selection', async function () {
      const timers = fakeTimers()
      const method = sinon.stub().returns(new Promise(() => {}))
      const operation = loginFixture({prompt: prompt({loginMethod: method}), timers}).login.login()
      await Promise.resolve()
      timers.fire()
      await expect(operation).to.be.rejectedWith('Login timed out')
      expect(method.calledOnce).to.be.true
    })

    it('rejects invalid runtime method without recursion or prompt', async function () {
      const method = sinon.stub().resolves({method: 'browser'} as LoginPromptSelection)
      const {login} = loginFixture({prompt: prompt({loginMethod: method})})
      await expect(login.login({method: 'x' as 'browser'})).to.be.rejectedWith('Invalid login method')
      expect(method.notCalled).to.be.true
    })

    it('uses only the API credential host when explicit API config has no Git host', async function () {
      const saveFromUrl = sinon.stub().resolves()
      const first = loginFixture({
        config: {apiUrl: 'https://custom-api.example.test'},
        storage: storage({saveAuth: saveFromUrl}),
      })
      queueInteractive(first.http)
      await first.login.login({method: 'interactive'})
      expect(saveFromUrl.firstCall.args[2]).to.deep.equal(['custom-api.example.test'])
      expect(saveFromUrl.firstCall.args[3]).to.equal('heroku-cli@custom-api.example.test')
    })

    it('uses the canonical native credential service for the default API', async function () {
      const getAuth = sinon.stub().resolves({account: 'previous@example.com', token: 'old-token'})
      const saveAuth = sinon.stub().resolves()
      const fixture = loginFixture({config: {}, storage: storage({getAuth, saveAuth})})
      queueInteractive(fixture.http)
      await fixture.login.login({method: 'interactive'})
      expect(getAuth.calledOnceWith(undefined, 'api.heroku.com', 'heroku-cli')).to.be.true
      expect(saveAuth.calledOnceWith('jöhn@example.com', 'new-token', ['api.heroku.com', 'git.heroku.com'], 'heroku-cli')).to.be.true
    })

    it('derives an isolated normalized native credential service for a custom API', async function () {
      const getAuth = sinon.stub().resolves({account: 'previous@example.com', token: 'old-token'})
      const readLoginState = sinon.stub().resolves({account: 'native@example.com'})
      const saveAuth = sinon.stub().resolves()
      const writeLoginState = sinon.stub().resolves()
      const fixture = loginFixture({
        config: {apiUrl: 'https://CUSTOM-API.example.test:8443', dataDir: '/fixture/custom-data'},
        storage: storage({
          getAuth, hasNativeStorage: () => true, readLoginState, saveAuth, writeLoginState,
        }),
      })
      queueInteractive(fixture.http)
      await fixture.login.login({method: 'interactive'})
      expect(readLoginState.notCalled).to.be.true
      expect(getAuth.calledOnceWith(undefined, 'custom-api.example.test:8443', 'heroku-cli@custom-api.example.test:8443')).to.be.true
      expect(saveAuth.calledOnceWith(
        'jöhn@example.com',
        'new-token',
        ['custom-api.example.test:8443'],
        'heroku-cli@custom-api.example.test:8443',
      )).to.be.true
      expect(writeLoginState.notCalled).to.be.true
    })

    it('uses an explicit credential service and isolates it from global login state', async function () {
      const getAuth = sinon.stub().resolves({account: 'previous@example.com', token: 'old-token'})
      const readLoginState = sinon.stub().resolves({account: 'native@example.com'})
      const saveAuth = sinon.stub().resolves()
      const writeLoginState = sinon.stub().resolves()
      const fixture = loginFixture({
        config: {
          apiUrl: 'https://api.heroku.com',
          credentialService: 'private-heroku-cli',
          dataDir: '/fixture/custom-data',
        },
        storage: storage({
          getAuth, hasNativeStorage: () => true, readLoginState, saveAuth, writeLoginState,
        }),
      })
      queueInteractive(fixture.http)
      await fixture.login.login({method: 'interactive'})
      expect(readLoginState.notCalled).to.be.true
      expect(getAuth.calledOnceWith(undefined, 'api.heroku.com', 'private-heroku-cli')).to.be.true
      expect(saveAuth.calledOnceWith('jöhn@example.com', 'new-token', ['api.heroku.com'], 'private-heroku-cli')).to.be.true
      expect(writeLoginState.notCalled).to.be.true
    })

    it('rejects invalid explicit credential services before login', function () {
      for (const credentialService of ['', '\0', 'service\0name']) {
        expect(() => loginFixture({config: {credentialService}})).to.throw('credentialService')
      }
    })

    it('preserves default, HEROKU_HOST, explicit Git, and HEROKU_GIT_HOST credential routing', async function () {
      const saveDefault = sinon.stub().resolves()
      const defaultFixture = loginFixture({config: {}, storage: storage({saveAuth: saveDefault})})
      queueInteractive(defaultFixture.http)
      await defaultFixture.login.login({method: 'interactive'})
      expect(defaultFixture.http.requests[0].url).to.equal('https://api.heroku.com/oauth/authorizations')
      expect(saveDefault.firstCall.args[2]).to.deep.equal(['api.heroku.com', 'git.heroku.com'])

      const saveFromHost = sinon.stub().resolves()
      const second = loginFixture({
        config: {},
        environment: environment({HEROKU_HOST: 'staging.heroku.com'}),
        storage: storage({saveAuth: saveFromHost}),
      })
      queueInteractive(second.http)
      await second.login.login({method: 'interactive'})
      expect(saveFromHost.firstCall.args[2]).to.deep.equal(['api.staging.heroku.com', 'git.staging.heroku.com'])

      const saveFromUrlHost = sinon.stub().resolves()
      const third = loginFixture({
        config: {},
        environment: environment({HEROKU_HOST: 'https://api.staging.heroku.com'}),
        storage: storage({saveAuth: saveFromUrlHost}),
      })
      queueInteractive(third.http)
      await third.login.login({method: 'interactive'})
      expect(saveFromUrlHost.firstCall.args[2]).to.deep.equal(['api.staging.heroku.com'])

      for (const [config, values, expected] of [
        [{apiUrl: 'https://custom-api.example.test', gitHost: 'git.custom.test'}, {}, ['custom-api.example.test', 'git.custom.test']],
        [{apiUrl: 'https://custom-api.example.test'}, {HEROKU_GIT_HOST: 'git.environment.test'}, ['custom-api.example.test', 'git.environment.test']],
        [{apiHost: 'same.heroku.test', apiUrl: 'https://same.heroku.test', gitHost: 'same.heroku.test'}, {}, ['same.heroku.test']],
      ] as const) {
        const saveAuth = sinon.stub().resolves()
        const fixture = loginFixture({config, environment: environment(values), storage: storage({saveAuth})})
        queueInteractive(fixture.http)
        await fixture.login.login({method: 'interactive'})
        expect(saveAuth.firstCall.args[2]).to.deep.equal(expected)
      }
    })

    it('routes login through HEROKU_API_URL without adding a production Git credential host', async function () {
      const saveAuth = sinon.stub().resolves()
      const fixture = loginFixture({
        config: {},
        environment: environment({HEROKU_API_URL: 'https://api.staging.heroku.com/v3/'}),
        storage: storage({saveAuth}),
      })
      queueInteractive(fixture.http)
      await fixture.login.login({method: 'interactive'})
      expect(fixture.http.requests[0].url).to.equal('https://api.staging.heroku.com/v3/oauth/authorizations')
      expect(saveAuth.firstCall.args[2]).to.deep.equal(['api.staging.heroku.com'])
    })

    it('routes browser login through HEROKU_LOGIN_HOST', async function () {
      const open = sinon.stub().resolves()
      const fixture = loginFixture({
        browser: {open},
        config: {},
        environment: environment({HEROKU_LOGIN_HOST: 'https://cli-auth.staging.heroku.com/login/'}),
      })
      fixture.http.responses.push(
        response({browser_url: '/browser/abc', cli_url: '/cli/abc', token: 'temporary-token'}),
        response({access_token: 'browser-token'}),
        response({email: 'browser@example.com'}),
      )
      await fixture.login.login({method: 'browser'})
      expect(fixture.http.requests[0].url).to.equal('https://cli-auth.staging.heroku.com/login/auth')
      expect(open.calledOnceWith('https://cli-auth.staging.heroku.com/browser/abc')).to.be.true
    })

    it('preserves custom API ports for login HTTP and credential storage', async function () {
      for (const apiUrl of ['https://custom-api.example.test:8443', 'https://custom-api.example.test:443', 'http://localhost:4567', 'http://[::1]:4567']) {
        const saveAuth = sinon.stub().resolves()
        const fixture = loginFixture({config: {apiUrl}, storage: storage({saveAuth})})
        queueInteractive(fixture.http)
        await fixture.login.login({method: 'interactive'})
        expect(fixture.http.requests[0].url).to.equal(`${new URL(apiUrl).href.replace(/\/$/, '')}/oauth/authorizations`)
        const explicitPort = apiUrl.match(/:(\d+)$/)?.[1]
        const expectedHost = `${new URL(apiUrl).hostname}${explicitPort ? `:${explicitPort}` : ''}`
        expect(saveAuth.firstCall.args[2][0]).to.equal(expectedHost)
      }
    })

    it('accepts explicit host ports including bracketed IPv6', async function () {
      for (const apiHost of ['custom-api.example.test:8443', 'custom-api.example.test:443', '[::1]:4567']) {
        const saveAuth = sinon.stub().resolves()
        const fixture = loginFixture({config: {apiHost}, storage: storage({saveAuth})})
        queueInteractive(fixture.http)
        await fixture.login.login({method: 'interactive'})
        expect(saveAuth.firstCall.args[2][0]).to.equal(apiHost)
      }
    })

    it('normalizes an explicit API host in the derived credential service', async function () {
      const saveAuth = sinon.stub().resolves()
      const fixture = loginFixture({
        config: {apiHost: 'CUSTOM-API.EXAMPLE.TEST:8443'},
        storage: storage({saveAuth}),
      })
      queueInteractive(fixture.http)
      await fixture.login.login({method: 'interactive'})
      expect(saveAuth.calledOnceWith(
        'jöhn@example.com',
        'new-token',
        ['custom-api.example.test:8443', 'git.heroku.com'],
        'heroku-cli@custom-api.example.test:8443',
      )).to.be.true
    })

    it('preserves a URL-form HEROKU_HOST port for login HTTP and API credential storage', async function () {
      const saveAuth = sinon.stub().resolves()
      const fixture = loginFixture({
        config: {},
        environment: environment({HEROKU_HOST: 'https://api.staging.heroku.com:8443'}),
        storage: storage({saveAuth}),
      })
      queueInteractive(fixture.http)
      await fixture.login.login({method: 'interactive'})
      expect(fixture.http.requests[0].url).to.equal('https://api.staging.heroku.com:8443/oauth/authorizations')
      expect(saveAuth.firstCall.args[2]).to.deep.equal(['api.staging.heroku.com:8443'])
    })

    it('accepts HTTPS and loopback HTTP endpoints', async function () {
      for (const apiUrl of ['https://staging.example.test', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
        const fixture = loginFixture({config: {apiUrl}})
        queueInteractive(fixture.http)
        await fixture.login.login({method: 'interactive'})
        expect(fixture.http.requests[0].url).to.equal(`${apiUrl}/oauth/authorizations`)
      }
    })

    it('rejects unsafe URL and hostname destinations before sending or persisting credentials', async function () {
      const unsafeConfigs = [
        {apiHost: 'https://api.heroku.test'},
        {apiHost: 'api.heroku.test:invalid'},
        {apiHost: 'api.heroku.test:65536'},
        {apiHost: 'api.heroku.test/path'},
        {apiHost: '::1:4567'},
        {apiUrl: 'http://attacker.test'},
        {apiUrl: 'https://user:password@api.heroku.test'},
        {apiUrl: 'https://api.heroku.test/path?secret=value'},
        {apiUrl: 'https://api.heroku.test/path?'},
        {apiUrl: 'https://api.heroku.test/path#fragment'},
        {apiUrl: 'https://api.heroku.test/path#'},
        {gitHost: 'git.heroku.test/path'},
        {loginHost: 'ftp://login.heroku.test'},
        {loginHost: 'https://user:password@login.heroku.test'},
        {loginHost: 'https://login.heroku.test/path?secret=value'},
        {loginHost: 'https://login.heroku.test/path?'},
        {loginHost: 'https://login.heroku.test/path#fragment'},
        {loginHost: 'https://login.heroku.test/path#'},
        {ssoUrl: 'data:text/html,unsafe'},
      ]
      for (const config of unsafeConfigs) {
        const http = new FakeHttp()
        const saveAuth = sinon.stub().resolves()
        expect(() => loginFixture({config, http, storage: storage({saveAuth})})).to.throw()
        expect(http.requests).to.deep.equal([])
        expect(saveAuth.notCalled).to.be.true
      }
    })

    it('rejects unsafe endpoint environment values before sending credentials', function () {
      for (const values of [
        {HEROKU_API_URL: 'http://attacker.test'},
        {HEROKU_API_URL: 'https://attacker.test'},
        {HEROKU_API_URL: 'https://api.heroku.com/path?secret=value'},
        {HEROKU_API_URL: 'https://api.heroku.com/path?'},
        {HEROKU_API_URL: 'https://api.heroku.com/path#fragment'},
        {HEROKU_API_URL: 'https://api.heroku.com/path#'},
        {HEROKU_GIT_HOST: 'git.heroku.test/path'},
        {HEROKU_HOST: 'api.heroku.test/path'},
        {HEROKU_HOST: 'attacker.test'},
        {HEROKU_HOST: 'https://api.heroku.com.attacker.test'},
        {HEROKU_HOST: 'https://localhost.attacker.test'},
        {HEROKU_HOST: 'https://api.heroku.com/path'},
        {HEROKU_LOGIN_HOST: 'ftp://login.heroku.test'},
        {HEROKU_LOGIN_HOST: 'https://cli-auth.heroku.com/path?secret=value'},
        {HEROKU_LOGIN_HOST: 'https://cli-auth.heroku.com/path?'},
        {HEROKU_LOGIN_HOST: 'https://cli-auth.heroku.com/path#fragment'},
        {HEROKU_LOGIN_HOST: 'https://cli-auth.heroku.com/path#'},
        {SSO_URL: 'data:text/html,unsafe'},
      ]) {
        const http = new FakeHttp()
        const saveAuth = sinon.stub().resolves()
        expect(() => loginFixture({
          config: {},
          environment: environment(values),
          http,
          storage: storage({saveAuth}),
        })).to.throw()
        expect(http.requests).to.deep.equal([])
        expect(saveAuth.notCalled).to.be.true
      }
    })

    it('allows an SSO URL containing a query and fragment', async function () {
      const open = sinon.stub().resolves()
      const fixture = loginFixture({browser: {open}, config: {ssoUrl: 'https://sso.example.test/login?source=cli#continue'}})
      fixture.http.responses.push(response({email: 'sso@example.com'}))
      await fixture.login.login({method: 'sso'})
      expect(open.calledOnceWith('https://sso.example.test/login?source=cli#continue')).to.be.true
    })

    it('allows official Heroku domains and exact loopback HEROKU_HOST values', async function () {
      for (const host of [
        'staging.heroku.com',
        'API.STAGING.HEROKU.COM',
        'api.staging.herokai.com',
        'staging.herokuspace.com',
        'https://api.staging.herokudev.com:8443',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://[::1]:3000',
      ]) {
        const fixture = loginFixture({config: {}, environment: environment({HEROKU_HOST: host})})
        queueInteractive(fixture.http)
        await fixture.login.login({method: 'interactive'})
      }
    })

    it('lets explicit API configuration override disallowed ambient API destinations', async function () {
      for (const values of [
        {HEROKU_API_URL: 'https://attacker.test'},
        {HEROKU_HOST: 'attacker.test'},
      ]) {
        const fixture = loginFixture({
          config: {apiUrl: 'https://private.example.test'},
          environment: environment(values),
        })
        queueInteractive(fixture.http)
        await fixture.login.login({method: 'interactive'})
        expect(fixture.http.requests[0].url).to.equal('https://private.example.test/oauth/authorizations')
      }
    })
  })

  describe('interactive', function () {
    it('prefills previous account from native login state and resolves stored auth', async function () {
      const email = sinon.stub().resolves('new@example.com')
      const getAuth = sinon.stub().resolves({account: 'previous@example.com', token: 'old-token'})
      const {http, login} = loginFixture({
        prompt: prompt({email}),
        storage: storage({
          getAuth,
          hasNativeStorage: () => true,
          readLoginState: async () => ({account: ' previous@example.com '}),
        }),
      })
      http.responses.push(response({access_token: {token: 'new-token'}, user: {email: 'new@example.com'}}))
      await login.login({method: 'interactive'})
      expect(getAuth.calledOnceWith('previous@example.com', 'api.heroku.test')).to.be.true
      expect(email.calledOnceWith('previous@example.com')).to.be.true
    })

    it('prefills the previous account from netrc-only storage', async function () {
      const email = sinon.stub().resolves('new@example.com')
      const getAuth = sinon.stub().resolves({account: ' netrc@example.com ', token: 'old-token'})
      const readLoginState = sinon.stub().resolves({account: 'native@example.com'})
      const {http, login} = loginFixture({
        prompt: prompt({email}),
        storage: storage({getAuth, hasNativeStorage: () => false, readLoginState}),
      })
      http.responses.push(response({access_token: {token: 'new-token'}, user: {email: 'new@example.com'}}))
      await login.login({method: 'interactive'})
      expect(readLoginState.notCalled).to.be.true
      expect(getAuth.calledOnceWith(undefined, 'api.heroku.test')).to.be.true
      expect(email.calledOnceWith('netrc@example.com')).to.be.true
    })

    it('continues when previous account lookup fails', async function () {
      const email = sinon.stub().resolves('new@example.com')
      const {http, login} = loginFixture({
        prompt: prompt({email}),
        storage: storage({
          async getAuth() {
            throw new Error('unavailable')
          },
        }),
      })
      http.responses.push(response({access_token: {token: 'new-token'}, user: {email: 'new@example.com'}}))
      await login.login({method: 'interactive'})
      expect(email.calledOnceWith()).to.be.true
    })

    it('sends UTF-8 Basic auth, global scope, and defaults to 30 days', async function () {
      const {http, login} = loginFixture()
      queueInteractive(http)
      await login.login({method: 'interactive'})
      const request = http.requests[0]
      expect(request.options.headers?.authorization).to.equal(`Basic ${Buffer.from('jöhn@example.com:pässword', 'utf8').toString('base64')}`)
      expect(request.options.body).to.deep.include({expires_in: 60 * 60 * 24 * 30, scope: ['global']})
      expect((request.options.body as {description: string}).description).to.equal('Heroku CLI login from fixture-host')
    })

    it('uses custom expiration and retries exactly once with exact 2FA header', async function () {
      const {http, login} = loginFixture()
      http.responses.push(
        response({id: 'two_factor', message: 'code required'}, 401),
        response({access_token: {token: '2fa-token'}, user: {email: 'jöhn@example.com'}}),
      )
      expect(await login.login({expiresIn: 12_345, method: 'interactive'})).to.deep.equal({account: 'jöhn@example.com', token: '2fa-token'})
      expect(http.requests).to.have.length(2)
      expect(http.requests[1].options.headers?.['Heroku-Two-Factor-Code']).to.equal('123456')
      expect(http.requests[1].options.body).to.include({expires_in: 12_345})
    })

    it('does not retry a failed 2FA submission', async function () {
      const {http, login} = loginFixture()
      http.responses.push(
        response({id: 'two_factor', message: 'code required'}, 401),
        response({id: 'two_factor', message: 'wrong code'}, 401),
      )
      await expect(login.login({method: 'interactive'})).to.be.rejectedWith('wrong code')
      expect(http.requests).to.have.length(2)
    })

    it('preserves structured device trust data with actionable message', async function () {
      const {http, login} = loginFixture()
      http.responses.push(response({
        id: 'device_trust_required',
        message: 'original',
        resource: 'authorization',
        secret: 'do-not-expose',
      }, 401))
      const error = await login.login({method: 'interactive'}).then(() => {
        throw new Error('Expected failure')
      }, error => error as LoginHttpError)
      expect(error).to.be.instanceOf(LoginHttpError)
      expect(error.status).to.equal(401)
      expect(error.id).to.equal('device_trust_required')
      expect(error.body).to.deep.include({id: 'device_trust_required'})
      expect(error.body).to.not.have.property('secret')
      expect(Object.keys(error.body ?? {})).to.have.members(['id', 'message', 'resource'])
      expect(error.message).to.contain('requires Two-Factor Authentication')
      expect(error.message).to.contain('Error ID: device_trust_required')
    })

    it('normalizes injected status/body errors and preserves useful IDs', async function () {
      const injected = Object.assign(new Error('request failed'), {body: {id: 'unauthorized', message: 'Not authorized'}, status: 401})
      const {http, login} = loginFixture()
      http.responses.push(injected)
      const error = await login.login({method: 'interactive'}).then(() => {
        throw new Error('Expected failure')
      }, error => error as LoginHttpError)
      expect(error).to.be.instanceOf(LoginHttpError)
      expect(error.status).to.equal(401)
      expect(error.message).to.equal('Not authorized\nError ID: unauthorized')
    })

    it('does not propagate credential-bearing injected diagnostics', async function () {
      const injected = Object.assign(new Error('jöhn@example.com pässword'), {body: {secret: 'body-secret'}, status: 401})
      const {http, login} = loginFixture()
      http.responses.push(injected)
      const error = await login.login({method: 'interactive'}).then(() => {
        throw new Error('Expected failure')
      }, error => error as LoginHttpError)
      expect(error.message).to.equal('Login request failed with status 401')
      expect(error.body).to.equal(undefined)
      expect(JSON.stringify(error)).to.not.contain('body-secret')
    })

    it('redacts raw and transformed interactive credentials from status-less transport diagnostics', async function () {
      const username = 'jöhn@example.com'
      const password = 'pässword'
      const basicCredentials = `${username}:${password}`
      const authorization = `Basic ${Buffer.from(basicCredentials, 'utf8').toString('base64')}`
      const injected = new Error(`proxy rejected ${username} ${password} ${Buffer.from(password).toString('base64')} ${basicCredentials} ${authorization}`)
      const {http, login} = loginFixture()
      http.responses.push(injected)
      const error = await login.login({method: 'interactive'}).then(() => {
        throw new Error('Expected failure')
      }, error => error as Error)
      expect(error.message).to.equal('proxy rejected [SCRUBBED] [SCRUBBED] [SCRUBBED] [SCRUBBED] [SCRUBBED]')
      for (const secret of [username, password, Buffer.from(password).toString('base64'), basicCredentials, authorization]) {
        expect(error.message).to.not.contain(secret)
      }
    })

    it('redacts two-factor credentials from retry transport diagnostics', async function () {
      const secondFactor = '123456'
      const {http, login} = loginFixture()
      http.responses.push(
        response({id: 'two_factor', message: 'code required'}, 401),
        new Error(`TLS failed for ${secondFactor} ${Buffer.from(secondFactor).toString('base64')}`),
      )
      const error = await login.login({method: 'interactive'}).then(() => {
        throw new Error('Expected failure')
      }, error => error as Error)
      expect(error.message).to.equal('TLS failed for [SCRUBBED] [SCRUBBED]')
    })

    it('validates successful wire responses and does not leak credentials in diagnostics', async function () {
      const {http, login} = loginFixture()
      http.responses.push(response({access_token: {}, user: {}}))
      const error = await login.login({method: 'interactive'}).then(() => {
        throw new Error('Expected failure')
      }, error => error as Error)
      expect(error.message).to.equal('Login response did not include an account email')
      expect(error.message).to.not.contain('jöhn@example.com')
      expect(error.message).to.not.contain('pässword')
    })
  })

  describe('browser', function () {
    function queueBrowser(http: FakeHttp) {
      http.responses.push(
        response({browser_url: '/browser/abc', cli_url: '/cli/abc', token: 'temporary-token'}),
        response({access_token: 'browser-token'}),
        response({email: 'browser@example.com'}),
      )
    }

    it('outputs a standalone manual URL, opens named browser, polls and validates with explicit Bearer tokens', async function () {
      const open = sinon.stub().resolves()
      const browser: LoginBrowser = {open}
      const {http, login, output: loginOutput} = loginFixture({browser})
      queueBrowser(http)
      expect(await login.login({browser: 'firefox', method: 'browser'})).to.deep.equal({account: 'browser@example.com', token: 'browser-token'})
      expect((loginOutput as ReturnType<typeof output>).messages).to.include('https://login.heroku.test/browser/abc')
      expect(open.calledOnceWith('https://login.heroku.test/browser/abc', {browser: 'firefox'})).to.be.true
      expect(http.requests[1].options.headers?.authorization).to.equal('Bearer temporary-token')
      expect(http.requests[2].options.headers?.authorization).to.equal('Bearer browser-token')
    })

    it('preserves browser and CLI path query strings', async function () {
      const open = sinon.stub().resolves()
      const {http, login} = loginFixture({browser: {open}})
      http.responses.push(
        response({browser_url: '/browser/abc?source=cli', cli_url: '/cli/abc?wait=true', token: 'temporary-token'}),
        response({access_token: 'browser-token'}),
        response({email: 'browser@example.com'}),
      )
      await login.login({method: 'browser'})
      expect(open.calledOnceWith('https://login.heroku.test/browser/abc?source=cli')).to.be.true
      expect(http.requests[1].url).to.equal('https://login.heroku.test/cli/abc?wait=true')
    })

    it('rejects unsafe browser and CLI paths before opening or polling without exposing tokens', async function () {
      const unsafePaths = ['https://attacker.test/path', '//attacker.test/path', '/\\attacker.test/path', '/@attacker.test/path']
      for (const field of ['browser_url', 'cli_url'] as const) {
        for (const unsafePath of unsafePaths) {
          const open = sinon.stub().resolves()
          const loginOutput = output()
          const fixture = loginFixture({browser: {open}, output: loginOutput})
          fixture.http.responses.push(response({
            browser_url: '/browser/safe',
            cli_url: '/cli/safe',
            [field]: unsafePath,
            token: 'temporary-secret-token',
          }))
          const error = await fixture.login.login({method: 'browser'}).then(() => {
            throw new Error('Expected failure')
          }, error => error as Error)
          expect(error.message).to.contain('must be a root-relative path')
          expect(error.message).to.not.contain('temporary-secret-token')
          expect(open.notCalled).to.be.true
          expect(fixture.http.requests).to.have.length(1)
          expect(loginOutput.messages.join('\n')).to.not.contain('temporary-secret-token')
          expect(loginOutput.warnings.join('\n')).to.not.contain('temporary-secret-token')
        }
      }
    })

    it('keeps manual flow usable when browser rejects or login is headless', async function () {
      for (const dependencies of [
        {
          browser: {
            async open() {
              throw new Error('no browser')
            },
          },
        },
        {environment: environment({HEROKU_TESTING_HEADLESS_LOGIN: '1'})},
      ]) {
        const loginOutput = output()
        const {http, login} = loginFixture({...dependencies, output: loginOutput})
        queueBrowser(http)
        await login.login({method: 'browser'})
        expect(loginOutput.messages).to.include('https://login.heroku.test/browser/abc')
        expect(loginOutput.warnings.some(message => /manual URL|headlessly/.test(message))).to.be.true
      }
    })

    it('retries status >500 three times after the first request', async function () {
      const {http, login} = loginFixture()
      http.responses.push(
        response({browser_url: '/browser', cli_url: '/cli', token: 'temp'}),
        response({message: 'bad'}, 501),
        response({message: 'bad'}, 503),
        response({message: 'bad'}, 599),
        response({access_token: 'token'}),
        response({email: 'account@example.com'}),
      )
      await login.login({method: 'browser'})
      expect(http.requests.filter(request => request.url.endsWith('/cli'))).to.have.length(4)
    })

    it('does not retry 500 and rejects body errors', async function () {
      const first = loginFixture()
      first.http.responses.push(response({browser_url: '/browser', cli_url: '/cli', token: 'temp'}), response({message: 'bad'}, 500))
      await expect(first.login.login({method: 'browser'})).to.be.rejectedWith('bad')
      expect(first.http.requests).to.have.length(2)

      const second = loginFixture()
      second.http.responses.push(response({browser_url: '/browser', cli_url: '/cli', token: 'temp'}), response({error: 'Denied'}))
      await expect(second.login.login({method: 'browser'})).to.be.rejectedWith('Denied')
    })

    it('scrubs the temporary token from successful poll response errors', async function () {
      const temporaryToken = 'temporary-poll-token'
      const authorization = `Bearer ${temporaryToken}`
      const {http, login} = loginFixture()
      http.responses.push(
        response({browser_url: '/browser', cli_url: '/cli', token: temporaryToken}),
        response({error: `Denied ${temporaryToken} ${authorization} ${Buffer.from(authorization).toString('base64')}`}),
      )

      const error = await login.login({method: 'browser'}).then(() => {
        throw new Error('Expected failure')
      }, error => error as Error)
      expect(error.message).to.equal('Denied [SCRUBBED] [SCRUBBED] [SCRUBBED]')
      expectSafeErrorSurface(error, [temporaryToken, authorization])
    })

    it('scrubs an acquired token from successful poll response errors', async function () {
      const acquiredToken = 'browser-acquired-secret'
      const {http, login} = loginFixture()
      http.responses.push(
        response({browser_url: '/browser', cli_url: '/cli', token: 'temporary-token'}),
        response({access_token: acquiredToken, error: `Denied Bearer ${acquiredToken}`}),
      )

      const error = await login.login({method: 'browser'}).then(() => {
        throw new Error('Expected failure')
      }, error => error as Error)
      expect(error.message).to.equal('Denied [SCRUBBED]')
      expect(error.message).to.not.contain(acquiredToken)
    })

    it('validates auth setup, poll, and account response fields', async function () {
      for (const responses of [
        [response({cli_url: '/cli', token: 'temp'})],
        [response({browser_url: '/browser', cli_url: '/cli', token: 'temp'}), response({})],
        [response({browser_url: '/browser', cli_url: '/cli', token: 'temp'}), response({access_token: 'token'}), response({})],
      ]) {
        const {http, login} = loginFixture()
        http.responses.push(...responses)
        await expect(login.login({method: 'browser'})).to.be.rejectedWith('Login response did not include')
      }
    })

    it('redacts temporary and acquired bearer tokens from transport diagnostics', async function () {
      for (const [responses, secret] of [
        [
          [response({browser_url: '/browser', cli_url: '/cli', token: 'temporary-token'}), new Error('proxy exposed Bearer temporary-token')],
          'temporary-token',
        ],
        [
          [response({browser_url: '/browser', cli_url: '/cli', token: 'temporary-token'}), response({access_token: 'browser-token'}), new Error(`DNS exposed ${Buffer.from('browser-token').toString('base64')}`)],
          'browser-token',
        ],
      ] as const) {
        const {http, login} = loginFixture()
        http.responses.push(...responses)
        const error = await login.login({method: 'browser'}).then(() => {
          throw new Error('Expected failure')
        }, error => error as Error)
        expect(error.message).to.contain('[SCRUBBED]')
        expect(error.message).to.not.contain(secret)
        expect(error.message).to.not.contain(Buffer.from(secret).toString('base64'))
      }
    })
  })

  describe('SSO and persistence', function () {
    it('uses configured SSO URL and explicit bearer account validation', async function () {
      const organization = sinon.stub().resolves('unused')
      const open = sinon.stub().resolves()
      const {http, login, output: loginOutput} = loginFixture({
        browser: {open},
        config: {
          apiHost: 'api.heroku.test', apiUrl: 'https://api.heroku.test', gitHost: 'git.heroku.test', ssoUrl: 'https://configured.sso/login',
        },
        prompt: prompt({organization}),
      })
      http.responses.push(response({email: 'sso@example.com'}))
      await login.login({method: 'sso'})
      expect(organization.notCalled).to.be.true
      expect(open.calledOnceWith('https://configured.sso/login')).to.be.true
      expect((loginOutput as ReturnType<typeof output>).messages).to.include('https://configured.sso/login')
      expect(http.requests[0].options.headers?.authorization).to.equal('Bearer sso-token')
    })

    it('prompts with default organization, URL encodes it, and survives opener failure', async function () {
      const organization = sinon.stub().resolves('my org/one')
      const open = sinon.stub().rejects(new Error('headless'))
      const loginOutput = output()
      const {http, login} = loginFixture({
        browser: {open},
        environment: environment({HEROKU_ORGANIZATION: 'default-org'}),
        output: loginOutput,
        prompt: prompt({organization}),
      })
      http.responses.push(response({email: 'sso@example.com'}))
      await login.login({method: 'sso'})
      expect(organization.calledOnceWith('default-org')).to.be.true
      expect(loginOutput.messages).to.include('https://sso.heroku.com/saml/my%20org%2Fone/init?cli=true')
      expect(loginOutput.warnings).to.include('Cannot open browser. Continue with the manual URL above.')
    })

    it('validates non-empty SSO token and account', async function () {
      const emptyToken = loginFixture({prompt: prompt({accessToken: async () => ''})})
      await expect(emptyToken.login.login({method: 'sso'})).to.be.rejectedWith('Access token is required')
      const emptyAccount = loginFixture()
      emptyAccount.http.responses.push(response({email: ''}))
      await expect(emptyAccount.login.login({method: 'sso'})).to.be.rejectedWith('Login response did not include an account email')
    })

    it('redacts the SSO access token and Bearer form from transport diagnostics', async function () {
      const token = 'sso-token'
      const {http, login} = loginFixture()
      http.responses.push(new Error(`proxy exposed ${token} Bearer ${token}`))
      const error = await login.login({method: 'sso'}).then(() => {
        throw new Error('Expected failure')
      }, error => error as Error)
      expect(error.message).to.equal('proxy exposed [SCRUBBED] [SCRUBBED]')
      expect(error.message).to.not.contain(token)
    })

    it('persists API and Git hosts before returning and writes native login state', async function () {
      const saveAuth = sinon.stub().resolves()
      const writeLoginState = sinon.stub().resolves()
      const {http, login} = loginFixture({storage: storage({hasNativeStorage: () => true, saveAuth, writeLoginState})})
      queueInteractive(http, 'saved@example.com', 'saved-token')
      expect(await login.login({method: 'interactive'})).to.deep.equal({account: 'saved@example.com', token: 'saved-token'})
      expect(saveAuth.calledOnceWith('saved@example.com', 'saved-token', ['api.heroku.test', 'git.heroku.test'])).to.be.true
      expect(writeLoginState.calledOnceWith('/fixture/data', 'saved@example.com')).to.be.true
    })

    it('projects saveAuth and writeLoginState failures without exposing auth or adapter metadata', async function () {
      const account = 'saved-secret@example.com'
      const token = 'saved-secret-token'
      const authorization = `Bearer ${token}`
      const combinedCredential = `${account}:${token}`
      for (const failingOperation of ['saveAuth', 'writeLoginState'] as const) {
        const adapterError = Object.assign(new AggregateError([
          new Error(`nested ${token}`),
        ], `${failingOperation} failed for ${account} ${Buffer.from(token).toString('base64')} ${Buffer.from(combinedCredential).toString('base64')}`, {
          cause: new Error(`storage cause exposed ${authorization}`),
        }), {
          body: {account, token},
          request: {authorization},
          response: {credential: token},
          status: 500,
        })
        const saveAuth = sinon.stub().resolves()
        const writeLoginState = sinon.stub().resolves()
        if (failingOperation === 'saveAuth') saveAuth.rejects(adapterError)
        else writeLoginState.rejects(adapterError)
        const {http, login} = loginFixture({
          storage: storage({hasNativeStorage: () => true, saveAuth, writeLoginState}),
        })
        queueInteractive(http, account, token)

        const error = await login.login({method: 'interactive'}).then(() => {
          throw new Error('Expected failure')
        }, error => error as Error)
        expect(error).to.not.equal(adapterError)
        expect(error).to.not.be.instanceOf(AggregateError)
        expect(error).to.not.be.instanceOf(LoginHttpError)
        expect(error.message).to.equal(`${failingOperation} failed for [SCRUBBED] [SCRUBBED] [SCRUBBED]`)
        expect(error.cause).to.equal(undefined)
        expect(error).to.not.have.any.keys('body', 'errors', 'request', 'response')
        expectSafeErrorSurface(error, [account, token, authorization, combinedCredential])
        if (failingOperation === 'saveAuth') expect(writeLoginState.notCalled).to.be.true
      }
    })

    it('treats storage-thrown HTTP errors as storage diagnostics', async function () {
      const account = 'storage-http@example.com'
      const token = 'storage-http-token'
      const adapterError = new LoginHttpError(500, {
        id: 'storage_error',
        message: `Could not save ${account}`,
        resource: token,
      })
      const {http, login} = loginFixture({storage: storage({saveAuth: sinon.stub().rejects(adapterError)})})
      queueInteractive(http, account, token)

      const error = await login.login({method: 'interactive'}).then(() => {
        throw new Error('Expected failure')
      }, error => error as Error)
      expect(error).to.not.equal(adapterError)
      expect(error).to.not.be.instanceOf(LoginHttpError)
      expect(error.message).to.equal('Could not save [SCRUBBED]\nError ID: storage_error')
      expect(error).to.not.have.any.keys('body', 'id', 'status')
      expectSafeErrorSurface(error, [account, token])
    })

    it('does not write login state without native storage and never revokes the previous login', async function () {
      const writeLoginState = sinon.stub().resolves()
      const {http, login} = loginFixture({storage: storage({hasNativeStorage: () => false, writeLoginState})})
      queueInteractive(http)
      await login.login({method: 'interactive'})
      expect(writeLoginState.notCalled).to.be.true
      expect(http.requests.some(request => request.options.method === 'DELETE')).to.be.false
    })
  })

  describe('timeout and progress', function () {
    it('passes request timeout and one operation signal to every login request and aborts it on timeout', async function () {
      const timers = fakeTimers()
      const fixture = loginFixture({config: {requestTimeoutMs: 321}, timers})
      fixture.http.responses.push(response({browser_url: '/browser', cli_url: '/cli', token: 'temporary-token'}))
      const operation = fixture.login.login({method: 'browser'})
      while (fixture.http.requests.length < 2) await Promise.resolve()
      const signals = fixture.http.requests.map(request => request.options.signal)
      expect(fixture.http.requests.every(request => request.options.timeoutMs === 321)).to.be.true
      expect(signals[0]).to.equal(signals[1])
      expect(signals[0]?.aborted).to.be.false
      timers.fire()
      await expect(operation).to.be.rejectedWith('Login timed out')
      expect(signals[0]?.aborted).to.be.true
    })

    it('predictably rejects the active operation and clears timer/progress', async function () {
      const timers = fakeTimers()
      const loginProgress = progress()
      const http: LoginHttp = {request: async () => new Promise(() => {})}
      const login = loginFixture({http, progress: loginProgress, timers}).login.login({method: 'browser'})
      await Promise.resolve()
      timers.fire()
      await expect(login).to.be.rejectedWith('Login timed out')
      expect(timers.cleared).to.equal(1)
      expect(loginProgress.stops).to.equal(1)
    })

    it('disables timeout before persistence and awaits a successful save', async function () {
      const timers = fakeTimers()
      let resolveSave = () => {}
      const saveAuth = sinon.stub().returns(new Promise<void>(resolve => {
        resolveSave = resolve
      }))
      const fixture = loginFixture({storage: storage({saveAuth}), timers})
      queueInteractive(fixture.http)
      const operation = fixture.login.login({method: 'interactive'})
      while (saveAuth.notCalled) await Promise.resolve()
      timers.fire()
      let settled = false
      operation.finally(() => {
        settled = true
      }).catch(() => {})
      await Promise.resolve()
      expect(settled).to.be.false
      resolveSave()
      await expect(operation).to.eventually.deep.equal({account: 'jöhn@example.com', token: 'new-token'})
      expect(saveAuth.calledOnce).to.be.true
      expect(timers.pending).to.equal(0)
    })

    it('does not report timeout or mutate login state when persistence later fails', async function () {
      const timers = fakeTimers()
      let rejectSave = (_error: Error) => {}
      const saveAuth = sinon.stub().returns(new Promise<void>((_resolve, reject) => {
        rejectSave = reject
      }))
      const writeLoginState = sinon.stub().resolves()
      const fixture = loginFixture({storage: storage({hasNativeStorage: () => true, saveAuth, writeLoginState}), timers})
      queueInteractive(fixture.http)
      const operation = fixture.login.login({method: 'interactive'})
      while (saveAuth.notCalled) await Promise.resolve()
      timers.fire()
      rejectSave(new Error('save failed'))
      await expect(operation).to.be.rejectedWith('save failed')
      expect(writeLoginState.notCalled).to.be.true
      expect(timers.pending).to.equal(0)
    })

    it('prevents persistence when timeout wins during acquisition', async function () {
      const timers = fakeTimers()
      const saveAuth = sinon.stub().resolves()
      const http: LoginHttp = {request: async () => new Promise(() => {})}
      const operation = loginFixture({http, storage: storage({saveAuth}), timers}).login.login({method: 'browser'})
      await Promise.resolve()
      timers.fire()
      await expect(operation).to.be.rejectedWith('Login timed out')
      expect(saveAuth.notCalled).to.be.true
    })

    it('stops progress and clears timeout on ordinary failures', async function () {
      const fixture = loginFixture()
      fixture.http.responses.push(response({message: 'failed'}, 400))
      await expect(fixture.login.login({method: 'browser'})).to.be.rejectedWith('failed')
      expect((fixture.timers as ReturnType<typeof fakeTimers>).cleared).to.equal(1)
      expect((fixture.progress as ReturnType<typeof progress>).stops).to.equal(1)
    })
  })
})

describe('Login logout', function () {
  const entry = {account: 'test@example.com', token: 'prefixABCDEFGHIJKLMNOPQRSTUVWXYZsuffix'}

  function logoutFixture(responses: Array<Error | LoginHttpResponse<unknown>>, storageOverrides: Partial<LoginStorage> = {}) {
    const fixture = loginFixture({storage: storage(storageOverrides)})
    fixture.http.responses.push(...responses)
    return fixture
  }

  it('requires a valid explicit entry before any local or remote mutation', async function () {
    for (const invalidEntry of [undefined, null, {}, {account: '', token: entry.token}, {account: entry.account, token: ''}]) {
      const removeAuth = sinon.stub().resolves()
      const deleteLoginState = sinon.stub().resolves()
      const getAuth = sinon.stub().resolves(entry)
      const readLoginState = sinon.stub().resolves({account: entry.account})
      const fixture = logoutFixture([], {
        deleteLoginState, getAuth, readLoginState, removeAuth,
      })
      const logout = fixture.login.logout as unknown as (value?: unknown) => Promise<void>
      await expect(logout.call(fixture.login, invalidEntry)).to.be.rejectedWith('A valid auth entry is required')
      expect(getAuth.notCalled).to.be.true
      expect(readLoginState.notCalled).to.be.true
      expect(removeAuth.notCalled).to.be.true
      expect(deleteLoginState.notCalled).to.be.true
      expect(fixture.http.requests).to.deep.equal([])
    }
  })

  it('uses the explicit entry without reading login state or stored auth', async function () {
    const getAuth = sinon.stub().rejects(new Error('must not read auth'))
    const readLoginState = sinon.stub().rejects(new Error('must not read state'))
    const fixture = logoutFixture([response({}), response([], 401)], {getAuth, readLoginState})
    await fixture.login.logout(entry)
    expect(getAuth.notCalled).to.be.true
    expect(readLoginState.notCalled).to.be.true
  })

  it('runs session and authorization-list requests in parallel with one explicit token and operation signal', async function () {
    const fixture = logoutFixture([response({}), response([], 401)])
    await fixture.login.logout(entry)
    expect(fixture.http.requests.map(request => request.url)).to.have.members([
      'https://api.heroku.test/oauth/sessions/~',
      'https://api.heroku.test/oauth/authorizations',
    ])
    for (const request of fixture.http.requests) expect(request.options.headers?.authorization).to.equal(`Bearer ${entry.token}`)
    expect(fixture.http.requests[0].options.signal).to.equal(fixture.http.requests[1].options.signal)
  })

  it('passes request timeout to logout requests and aborts their operation signal on timeout', async function () {
    const timers = fakeTimers()
    const requests: Request[] = []
    const http: LoginHttp = {
      async request(url, options) {
        requests.push({options, url})
        return new Promise(() => {})
      },
    }
    const fixture = loginFixture({config: {requestTimeoutMs: 654}, http, timers})
    const operation = fixture.login.logout(entry)
    await Promise.resolve()
    expect(requests).to.have.length(2)
    expect(requests.every(request => request.options.timeoutMs === 654)).to.be.true
    expect(requests[0].options.signal).to.equal(requests[1].options.signal)
    timers.fire()
    await expect(operation).to.be.rejectedWith('Logout timed out')
    expect(requests[0].options.signal?.aborted).to.be.true
    expect(requests[1].options.signal?.aborted).to.be.true
  })

  it('accepts exact session errors and treats list-page 401 as an already-unauthorized no-op', async function () {
    for (const sessionResponse of [response({id: 'not_found', resource: 'session'}, 404), response({}, 401)]) {
      const fixture = logoutFixture([sessionResponse, response([], 401)])
      await fixture.login.logout(entry)
      expect(fixture.http.requests).to.have.length(2)
    }
  })

  it('does not swallow near-miss session 404 or authorization-list 404', async function () {
    for (const responses of [
      [response({id: 'not_found', resource: 'authorization'}, 404), response([], 401)],
      [response({}), response({id: 'not_found', resource: 'authorization'}, 404)],
    ]) {
      const fixture = logoutFixture(responses)
      await expect(fixture.login.logout(entry)).to.be.rejectedWith(LoginHttpError)
    }
  })

  it('normalizes logout transport errors without exposing adapter diagnostics or extra response fields', async function () {
    const injected = Object.assign(new Error(`adapter leaked ${entry.token}`), {
      body: {
        id: 'server_error', message: 'Safe public message', resource: 'session', secret: 'body-secret',
      },
      status: 500,
    })
    const fixture = logoutFixture([injected, response([], 401)])
    const error = await fixture.login.logout(entry).then(() => {
      throw new Error('Expected failure')
    }, error => error as LoginHttpError)
    expect(error).to.be.instanceOf(LoginHttpError)
    expect(error.message).to.equal('Safe public message\nError ID: server_error')
    expect(error.body).to.deep.equal({id: 'server_error', message: 'Safe public message', resource: 'session'})
    expect(Object.keys(error.body ?? {})).to.have.members(['id', 'message', 'resource'])
    expect(JSON.stringify(error)).to.not.contain(entry.token)
    expect(JSON.stringify(error)).to.not.contain('body-secret')
  })

  it('redacts the logout token from status-less transport diagnostics', async function () {
    const fixture = logoutFixture([new Error(`proxy exposed Bearer ${entry.token}`), response([], 401)])
    const error = await fixture.login.logout(entry).then(() => {
      throw new Error('Expected failure')
    }, error => error as Error)
    expect(error.message).to.equal('proxy exposed [SCRUBBED]')
    expect(error.message).to.not.contain(entry.token)
  })

  it('fetches all authorization pages sequentially using case-insensitive Next-Range and verbatim Range', async function () {
    const fixture = logoutFixture([
      response({}),
      response([{access_token: {token: entry.token}, id: 'first'}], 206, {'nExT-rAnGe': 'id ..; weird="value"'}),
      response([{access_token: {token: entry.token}, id: 'second'}]),
      response({access_token: {token: 'default'}}),
      response({}),
      response({}),
    ])
    await fixture.login.logout(entry)
    expect(fixture.http.requests[2].options.headers?.Range).to.equal('id ..; weird="value"')
    expect(fixture.http.requests.filter(request => request.url.includes('/oauth/authorizations/') && request.options.method === 'DELETE').map(request => request.url)).to.have.members([
      'https://api.heroku.test/oauth/authorizations/first',
      'https://api.heroku.test/oauth/authorizations/second',
    ])
  })

  it('fully accumulates and validates pages before deleting an authorization', async function () {
    let resolveSecondPage = (_response: LoginHttpResponse<unknown>) => {}
    const secondPage = new Promise<LoginHttpResponse<unknown>>(resolve => {
      resolveSecondPage = resolve
    })
    const requests: Request[] = []
    const responses = [
      Promise.resolve(response({})),
      Promise.resolve(response([{access_token: {token: entry.token}, id: 'first'}], 206, {'Next-Range': 'next'})),
      secondPage,
      Promise.resolve(response({access_token: {token: 'default'}})),
      Promise.resolve(response({})),
    ]
    const http: LoginHttp = {
      async request<T>(url: string, options: LoginHttpRequest): Promise<LoginHttpResponse<T>> {
        requests.push({options, url})
        return await responses.shift() as LoginHttpResponse<T>
      },
    }
    const fixture = loginFixture({http})
    const operation = fixture.login.logout(entry)
    while (requests.length < 3) await Promise.resolve()
    expect(requests.some(request => request.url.endsWith('/first') && request.options.method === 'DELETE')).to.be.false
    resolveSecondPage(response({not: 'a list'}))
    await expect(operation).to.be.rejectedWith('authorization list')
    expect(requests.some(request => request.url.endsWith('/first') && request.options.method === 'DELETE')).to.be.false
  })

  it('rejects incomplete authorization enumeration when a later page returns 401 without deleting an authorization', async function () {
    const removeAuth = sinon.stub().resolves()
    const deleteLoginState = sinon.stub().resolves()
    const fixture = logoutFixture([
      response({}),
      response([{access_token: {token: entry.token}, id: 'first'}], 206, {'Next-Range': 'next'}),
      response({}, 401),
    ], {deleteLoginState, removeAuth})

    await expect(fixture.login.logout(entry)).to.be.rejectedWith('Remote authorization revocation may be incomplete because the authorization list could not be fully enumerated')
    expect(removeAuth.calledOnce).to.be.true
    expect(deleteLoginState.calledOnce).to.be.true
    expect(fixture.http.requests.some(request => request.url.includes('/oauth/authorizations/') && request.options.method === 'DELETE')).to.be.false
  })

  it('rejects unsafe authorization pagination before deletion', async function () {
    const scenarios = [
      [response([], 206)],
      [response([], 206, {'Next-Range': ''})],
      [response([], 206, {'Next-Range': 'same'}), response([], 206, {'next-range': 'same'})],
    ]
    for (const pages of scenarios) {
      const fixture = logoutFixture([response({}), ...pages])
      await expect(fixture.login.logout(entry)).to.be.rejectedWith('authorization pagination')
      expect(fixture.http.requests.some(request => request.url.includes('/oauth/authorizations/') && request.options.method === 'DELETE')).to.be.false
    }
  })

  it('limits authorization pagination to 500 pages', async function () {
    const pages = Array.from({length: 500}, (_, index) => response([], 206, {'Next-Range': `page-${index + 1}`}))
    const fixture = logoutFixture([response({}), ...pages])
    await expect(fixture.login.logout(entry)).to.be.rejectedWith('exceeded 500 pages')
    expect(fixture.http.requests.some(request => request.url.includes('/oauth/authorizations/') && request.options.method === 'DELETE')).to.be.false
  })

  it('protects a matching default authorization and accepts only its exact expected 404', async function () {
    for (const defaultResponse of [
      response({access_token: {token: entry.token}}),
      response({access_token: {token: 'prefix**********suffix'}}),
      response({id: 'not_found', resource: 'authorization'}, 404),
    ]) {
      const responses = [response({}), response([{access_token: {token: entry.token}, id: 'matching'}]), defaultResponse]
      if (defaultResponse.status === 404) responses.push(response({}))
      const fixture = logoutFixture(responses)
      await fixture.login.logout(entry)
      expect(fixture.http.requests.some(request => request.url.endsWith('/matching'))).to.equal(defaultResponse.status === 404)
    }
  })

  it('rejects near-miss default authorization 404 responses before deletion', async function () {
    for (const body of [
      {id: 'not_found', resource: 'session'},
      {id: 'other', resource: 'authorization'},
      {id: 'not_found'},
    ]) {
      const fixture = logoutFixture([
        response({}), response([{access_token: {token: entry.token}, id: 'matching'}]), response(body, 404),
      ])
      await expect(fixture.login.logout(entry)).to.be.rejectedWith(LoginHttpError)
      expect(fixture.http.requests.some(request => request.url.endsWith('/matching'))).to.be.false
    }
  })

  it('surfaces incomplete remote revocation after local cleanup when default lookup returns 401', async function () {
    const removeAuth = sinon.stub().resolves()
    const deleteLoginState = sinon.stub().resolves()
    const fixture = logoutFixture([
      response({}), response([{access_token: {token: entry.token}, id: 'matching'}]), response({}, 401),
    ], {deleteLoginState, removeAuth})
    await expect(fixture.login.logout(entry)).to.be.rejectedWith('Remote authorization revocation may be incomplete')
    expect(removeAuth.calledOnce).to.be.true
    expect(deleteLoginState.calledOnce).to.be.true
    expect(fixture.http.requests.some(request => request.url.endsWith('/matching'))).to.be.false
  })

  it('rejects malformed successful default authorization responses before deletion', async function () {
    for (const body of [{}, {access_token: {}}, {access_token: {token: ''}}, {access_token: {token: 123}}]) {
      const fixture = logoutFixture([
        response({}), response([{access_token: {token: entry.token}, id: 'matching'}]), response(body),
      ])
      await expect(fixture.login.logout(entry)).to.be.rejectedWith('default authorization token')
      expect(fixture.http.requests.some(request => request.url.endsWith('/matching'))).to.be.false
    }
  })

  it('safely skips authorization deletion for the existing all-ten-asterisk default mask', async function () {
    const fixture = logoutFixture([
      response({}), response([{access_token: {token: entry.token}, id: 'matching'}]), response({access_token: {token: '**********'}}),
    ])
    await fixture.login.logout(entry)
    expect(fixture.http.requests.some(request => request.url.endsWith('/matching'))).to.be.false
  })

  it('rejects invalid default token masks before authorization deletion', async function () {
    for (const defaultToken of [
      'prefix**********',
      '**********suffix',
      'prefix**********middle**********suffix',
      'pre*fix**********suffix',
      'prefix**********suf*fix',
    ]) {
      const fixture = logoutFixture([
        response({}),
        response([{access_token: {token: entry.token}, id: 'matching'}]),
        response({access_token: {token: defaultToken}}),
      ])
      await expect(fixture.login.logout(entry)).to.be.rejectedWith('default authorization token mask')
      expect(fixture.http.requests.some(request => request.url.endsWith('/matching'))).to.be.false
    }
  })

  it('prefers exact matches and deletes every unique exact ID', async function () {
    const fixture = logoutFixture([
      response({}),
      response([
        {access_token: {token: 'prefix**********suffix'}, id: 'redacted'},
        {access_token: {token: entry.token}, id: 'exact-one'},
        {access_token: {token: entry.token}, id: 'exact-one'},
        {access_token: {token: entry.token}, id: 'exact-two'},
      ]),
      response({access_token: {token: 'default'}}),
      response({}),
      response({}),
    ])
    await fixture.login.logout(entry)
    expect(fixture.http.requests.filter(request => request.url.includes('/oauth/authorizations/') && request.options.method === 'DELETE').map(request => request.url)).to.have.members([
      'https://api.heroku.test/oauth/authorizations/exact-one',
      'https://api.heroku.test/oauth/authorizations/exact-two',
    ])
  })

  it('ignores malformed inferred candidates when an exact match exists', async function () {
    const fixture = logoutFixture([
      response({}),
      response([
        {access_token: {token: 'prefix**********'}},
        {access_token: {token: entry.token}, id: 'exact'},
      ]),
      response({access_token: {token: 'default'}}),
      response({}),
    ])
    await fixture.login.logout(entry)
    expect(fixture.http.requests.filter(request => request.url.endsWith('/exact'))).to.have.length(1)
  })

  it('deletes one distinct redacted match and accepts DELETE 401 as already revoked', async function () {
    const fixture = logoutFixture([
      response({}),
      response([
        {access_token: {token: 'prefix**********suffix'}, id: 'redacted'},
        {access_token: {token: 'prefix**********suffix'}, id: 'redacted'},
      ]),
      response({access_token: {token: 'default'}}),
      response({}, 401),
    ])
    await fixture.login.logout(entry)
    expect(fixture.http.requests.filter(request => request.url.endsWith('/redacted'))).to.have.length(1)
  })

  it('deletes one unique prefix-only ten-asterisk redacted match', async function () {
    const fixture = logoutFixture([
      response({}),
      response([
        {access_token: {token: 'prefix**********'}, id: 'prefix-only'},
        {access_token: {token: 'prefix**********'}, id: 'prefix-only'},
      ]),
      response({access_token: {token: 'default'}}),
      response({}),
    ])
    await fixture.login.logout(entry)
    expect(fixture.http.requests.filter(request => request.url.endsWith('/prefix-only'))).to.have.length(1)
  })

  it('ignores redacted candidates whose local token cannot contain all ten hidden characters', async function () {
    for (const [token, redactedToken] of [
      ['prefix123456789suffix', 'prefix**********suffix'],
      ['prefix', 'prefix**********fix'],
      ['prefix', 'prefix**********'],
    ]) {
      const shortEntry = {account: entry.account, token}
      const fixture = logoutFixture([
        response({}),
        response([{access_token: {token: redactedToken}, id: 'short-match'}]),
        response({access_token: {token: 'default'}}),
      ])
      await fixture.login.logout(shortEntry)
      expect(fixture.http.requests.some(request => request.url.endsWith('/short-match'))).to.be.false
    }
  })

  it('does not treat an undersized prefix-and-suffix mask as the default authorization', async function () {
    const shortEntry = {account: entry.account, token: 'prefix123456789suffix'}
    const fixture = logoutFixture([
      response({}),
      response([{access_token: {token: shortEntry.token}, id: 'matching'}]),
      response({access_token: {token: 'prefix**********suffix'}}),
    ])
    await expect(fixture.login.logout(shortEntry)).to.be.rejectedWith('default authorization token mask')
    expect(fixture.http.requests.some(request => request.url.endsWith('/matching'))).to.be.false
  })

  it('retains non-401 authorization deletion errors', async function () {
    const fixture = logoutFixture([
      response({}),
      response([{access_token: {token: entry.token}, id: 'matching'}]),
      response({access_token: {token: 'default'}}),
      response({message: 'delete failed'}, 500),
    ])
    await expect(fixture.login.logout(entry)).to.be.rejectedWith('delete failed')
  })

  it('rejects multiple distinct redacted matches before deletion', async function () {
    const fixture = logoutFixture([
      response({}),
      response([
        {access_token: {token: 'prefix**********suffix'}, id: 'one'},
        {access_token: {token: 'prefix**********suffix'}, id: 'two'},
      ]),
      response({access_token: {token: 'default'}}),
    ])
    await expect(fixture.login.logout(entry)).to.be.rejectedWith('multiple redacted authorizations')
    expect(fixture.http.requests.some(request => request.url.endsWith('/one') || request.url.endsWith('/two'))).to.be.false
  })

  it('rejects multiple prefix-only or mixed inferred IDs before deletion', async function () {
    for (const authorizations of [
      [
        {access_token: {token: 'prefix**********'}, id: 'one'},
        {access_token: {token: 'prefix**********'}, id: 'two'},
      ],
      [
        {access_token: {token: 'prefix**********'}, id: 'prefix-only'},
        {access_token: {token: 'prefix**********suffix'}, id: 'prefix-and-suffix'},
      ],
    ]) {
      const fixture = logoutFixture([
        response({}),
        response(authorizations),
        response({access_token: {token: 'default'}}),
      ])
      await expect(fixture.login.logout(entry)).to.be.rejectedWith('multiple redacted authorizations')
      expect(fixture.http.requests.some(request => request.url.endsWith('/one') || request.url.endsWith('/two') || request.url.endsWith('/prefix-only') || request.url.endsWith('/prefix-and-suffix'))).to.be.false
    }
  })

  it('rejects a matching authorization without a valid ID before deletion', async function () {
    for (const id of [undefined, '', 123]) {
      const fixture = logoutFixture([
        response({}),
        response([{access_token: {token: entry.token}, id}, {access_token: {token: entry.token}, id: 'valid'}]),
        response({access_token: {token: 'default'}}),
      ])
      await expect(fixture.login.logout(entry)).to.be.rejectedWith('matching authorization ID')
      expect(fixture.http.requests.some(request => request.url.endsWith('/valid'))).to.be.false
    }
  })

  it('does not match invalid redaction masks', async function () {
    const fixture = logoutFixture([
      response({}),
      response([
        {access_token: {token: '**********suffix'}, id: 'suffix-only'},
        {access_token: {token: 'prefix**********middle**********suffix'}, id: 'multiple'},
        {access_token: {token: 'pre*fix**********suffix'}, id: 'star-prefix'},
        {access_token: {token: 'prefix**********suf*fix'}, id: 'star-suffix'},
        {access_token: {token: '**********'}, id: 'all-stars'},
      ]),
      response({access_token: {token: 'default'}}),
    ])
    await fixture.login.logout(entry)
    expect(fixture.http.requests.filter(request => request.url.includes('/oauth/authorizations/') && request.options.method === 'DELETE')).to.deep.equal([])
  })

  it('preserves custom API ports without adding a production Git cleanup host', async function () {
    for (const apiUrl of ['https://custom-api.example.test:8443', 'https://custom-api.example.test:443', 'http://localhost:4567', 'http://[::1]:4567']) {
      const removeAuth = sinon.stub().resolves()
      const fixture = loginFixture({config: {apiUrl}, storage: storage({removeAuth})})
      fixture.http.responses.push(response({}), response([], 401))
      await fixture.login.logout(entry)
      const explicitPort = apiUrl.match(/:(\d+)$/)?.[1]
      const expectedHost = `${new URL(apiUrl).hostname}${explicitPort ? `:${explicitPort}` : ''}`
      expect(removeAuth.calledOnceWith(entry.account, [expectedHost])).to.be.true
    }
  })

  it('uses the same deduplicated credential hosts for save and remove', async function () {
    const saveAuth = sinon.stub().resolves()
    const removeAuth = sinon.stub().resolves()
    const fixture = loginFixture({
      config: {apiHost: 'same.heroku.test', apiUrl: 'https://same.heroku.test', gitHost: 'same.heroku.test'},
      storage: storage({removeAuth, saveAuth}),
    })
    queueInteractive(fixture.http, entry.account, entry.token)
    await fixture.login.login({method: 'interactive'})
    fixture.http.responses.push(response({}), response([], 401))
    await fixture.login.logout(entry)
    expect(saveAuth.calledOnceWith(entry.account, entry.token, ['same.heroku.test'])).to.be.true
    expect(removeAuth.calledOnceWith(entry.account, ['same.heroku.test'])).to.be.true
  })

  it('forwards the credential service and expected token to conditional local cleanup', async function () {
    const removeAuth = sinon.stub().resolves()
    const fixture = loginFixture({
      config: {
        apiUrl: 'https://custom-api.example.test:8443',
        credentialService: 'custom-service',
      },
      storage: storage({removeAuth}),
    })
    fixture.http.responses.push(response({}), response([], 401))
    await fixture.login.logout(entry)
    expect(removeAuth.calledOnceWith(
      entry.account,
      ['custom-api.example.test:8443'],
      'custom-service',
      entry.token,
    )).to.be.true
  })

  it('does not delete global login state for an isolated credential service', async function () {
    const deleteLoginState = sinon.stub().resolves()
    const fixture = loginFixture({
      config: {
        apiUrl: 'https://custom-api.example.test',
        dataDir: '/fixture/custom-data',
      },
      storage: storage({deleteLoginState}),
    })
    fixture.http.responses.push(response({}), response([], 401))
    await fixture.login.logout(entry)
    expect(deleteLoginState.notCalled).to.be.true
  })

  it('starts local cleanup immediately and settles hanging remote requests after the logout timeout', async function () {
    const timers = fakeTimers()
    const removeAuth = sinon.stub().resolves()
    const deleteLoginState = sinon.stub().resolves()
    const http: LoginHttp = {request: async () => new Promise(() => {})}
    const fixture = loginFixture({http, storage: storage({deleteLoginState, removeAuth}), timers})
    const operation = fixture.login.logout(entry)
    expect(removeAuth.calledOnce).to.be.true
    expect(deleteLoginState.calledOnce).to.be.true
    timers.fire()
    await expect(operation).to.be.rejectedWith('Logout timed out')
    expect(timers.cleared).to.equal(1)
    expect(timers.pending).to.equal(0)
  })

  it('aborts hanging remote cleanup at timeout but waits for already-started local cleanup', async function () {
    const timers = fakeTimers()
    const requests: Request[] = []
    let resolveLocalCleanup = () => {}
    const removeAuth = sinon.stub().returns(new Promise<void>(resolve => {
      resolveLocalCleanup = resolve
    }))
    const http: LoginHttp = {
      async request(url, options) {
        requests.push({options, url})
        return new Promise(() => {})
      },
    }
    const fixture = loginFixture({http, storage: storage({removeAuth}), timers})
    const operation = fixture.login.logout(entry)
    while (requests.length < 2) await Promise.resolve()

    let settled = false
    operation.finally(() => {
      settled = true
    }).catch(() => {})
    timers.fire()
    await new Promise(resolve => {
      setImmediate(resolve)
    })

    expect(requests.every(request => request.options.signal?.aborted)).to.be.true
    expect(settled).to.be.false
    resolveLocalCleanup()
    await expect(operation).to.be.rejectedWith('Logout timed out')
  })

  it('preserves local cleanup failure precedence after the remote timeout', async function () {
    const timers = fakeTimers()
    let rejectLocalCleanup = (_error: Error) => {}
    const removeAuth = sinon.stub().returns(new Promise<void>((_resolve, reject) => {
      rejectLocalCleanup = reject
    }))
    const http: LoginHttp = {request: async () => new Promise(() => {})}
    const operation = loginFixture({http, storage: storage({removeAuth}), timers}).login.logout(entry)
    await Promise.resolve()
    timers.fire()
    rejectLocalCleanup(new Error('local failed'))
    await expect(operation).to.be.rejectedWith('local failed')
  })

  it('attempts local cleanup and then surfaces unexpected remote errors', async function () {
    const removeAuth = sinon.stub().resolves()
    const deleteLoginState = sinon.stub().resolves()
    const fixture = logoutFixture([response({message: 'remote failed'}, 500), response([], 401)], {deleteLoginState, removeAuth})
    await expect(fixture.login.logout(entry)).to.be.rejectedWith('remote failed')
    expect(removeAuth.calledOnce).to.be.true
    expect(deleteLoginState.calledOnce).to.be.true
  })

  it('gives deterministic precedence to local cleanup failure over remote failure', async function () {
    const deleteLoginState = sinon.stub().resolves()
    const fixture = logoutFixture(
      [response({message: 'remote failed'}, 500), response([], 401)],
      {
        deleteLoginState,
        async removeAuth() {
          throw new Error('local failed')
        },
      },
    )
    await expect(fixture.login.logout(entry)).to.be.rejectedWith('local failed')
    expect(deleteLoginState.calledOnce).to.be.true
  })

  it('projects removeAuth and deleteLoginState failures without exposing resolved auth or adapter metadata', async function () {
    const authorization = `Bearer ${entry.token}`
    const combinedCredential = `${entry.account}:${entry.token}`
    for (const failingOperation of ['removeAuth', 'deleteLoginState'] as const) {
      const adapterError = Object.assign(new AggregateError([
        new Error(`nested ${entry.token}`),
      ], `${failingOperation} failed for ${entry.account} ${Buffer.from(entry.token).toString('base64')} ${Buffer.from(combinedCredential).toString('base64')}`, {
        cause: new Error(`storage cause exposed ${authorization}`),
      }), {
        body: {account: entry.account, token: entry.token},
        request: {authorization},
        response: {credential: entry.token},
        status: 500,
      })
      const removeAuth = sinon.stub().resolves()
      const deleteLoginState = sinon.stub().resolves()
      if (failingOperation === 'removeAuth') removeAuth.rejects(adapterError)
      else deleteLoginState.rejects(adapterError)
      const fixture = logoutFixture([response({message: 'remote failed'}, 500), response([], 401)], {
        deleteLoginState,
        removeAuth,
      })

      const error = await fixture.login.logout(entry).then(() => {
        throw new Error('Expected failure')
      }, error => error as Error)
      expect(error).to.not.equal(adapterError)
      expect(error).to.not.be.instanceOf(AggregateError)
      expect(error).to.not.be.instanceOf(LoginHttpError)
      expect(error.message).to.equal(`${failingOperation} failed for [SCRUBBED] [SCRUBBED] [SCRUBBED]`)
      expect(error.cause).to.equal(undefined)
      expect(error).to.not.have.any.keys('body', 'errors', 'request', 'response')
      expectSafeErrorSurface(error, [entry.account, entry.token, authorization, combinedCredential])
      expect(removeAuth.calledOnce).to.be.true
      expect(deleteLoginState.calledOnce).to.be.true
    }
  })
})

/* eslint-enable camelcase, mocha/max-top-level-suites, no-await-in-loop, unicorn/consistent-function-scoping */
