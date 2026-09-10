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

function response<T>(body: T, status = 200): LoginHttpResponse<T> {
  return {
    body, headers: {}, ok: status >= 200 && status < 300, status,
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

    it('derives persistence hosts from explicit API config and allowed HEROKU_HOST', async function () {
      const saveFromUrl = sinon.stub().resolves()
      const first = loginFixture({
        config: {apiUrl: 'https://custom-api.example.test'},
        storage: storage({saveAuth: saveFromUrl}),
      })
      queueInteractive(first.http)
      await first.login.login({method: 'interactive'})
      expect(saveFromUrl.firstCall.args[2][0]).to.equal('custom-api.example.test')

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
      expect(saveFromUrlHost.firstCall.args[2]).to.deep.equal(['api.staging.heroku.com', 'api.staging.heroku.com'])
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
      expect(saveAuth.firstCall.args[2]).to.deep.equal(['api.staging.heroku.com:8443', 'api.staging.heroku.com:8443'])
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
        {gitHost: 'git.heroku.test/path'},
        {loginHost: 'ftp://login.heroku.test'},
        {loginHost: 'https://user:password@login.heroku.test'},
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
        {HEROKU_GIT_HOST: 'git.heroku.test/path'},
        {HEROKU_HOST: 'api.heroku.test/path'},
        {HEROKU_HOST: 'attacker.test'},
        {HEROKU_HOST: 'https://api.heroku.com.attacker.test'},
        {HEROKU_HOST: 'https://localhost.attacker.test'},
        {HEROKU_HOST: 'https://api.heroku.com/path'},
        {HEROKU_LOGIN_HOST: 'ftp://login.heroku.test'},
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

  it('runs session and authorization-list requests in parallel with the same explicit token', async function () {
    const fixture = logoutFixture([
      response({}), response([]), response({access_token: {token: 'other'}}),
    ])
    await fixture.login.logout(entry)
    expect(fixture.http.requests.slice(0, 2).map(request => request.url)).to.have.members([
      'https://api.heroku.test/oauth/sessions/~',
      'https://api.heroku.test/oauth/authorizations',
    ])
    for (const request of fixture.http.requests) expect(request.options.headers?.authorization).to.equal(`Bearer ${entry.token}`)
  })

  it('accepts exact session 404/401, authorization-list 401, and default authorization 404/401', async function () {
    const scenarios: Array<Array<LoginHttpResponse<unknown>>> = [
      [response({id: 'not_found', resource: 'session'}, 404), response([], 401)],
      [response({}, 401), response([]), response({id: 'not_found', resource: 'authorization'}, 404)],
      [response({}), response([]), response({}, 401)],
    ]
    for (const responses of scenarios) {
      const fixture = logoutFixture(responses)
      await fixture.login.logout(entry)
      if (responses[1].status === 401) expect(fixture.http.requests).to.have.length(2)
    }
  })

  it('does not swallow near-miss 404s', async function () {
    const fixture = logoutFixture([response({id: 'not_found', resource: 'authorization'}, 404), response([], 401)])
    await expect(fixture.login.logout(entry)).to.be.rejectedWith(LoginHttpError)
  })

  it('does not treat authorization-list 404 as expected', async function () {
    const fixture = logoutFixture([response({}), response({id: 'not_found'}, 404)])
    await expect(fixture.login.logout(entry)).to.be.rejectedWith(LoginHttpError)
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

  it('protects the default API key using exact and ten-asterisk redaction matching', async function () {
    for (const defaultToken of [entry.token, 'prefix**********suffix']) {
      const fixture = logoutFixture([
        response({}),
        response([{access_token: {token: 'prefix**********suffix'}, id: 'matching'}]),
        response({access_token: {token: defaultToken}}),
      ])
      await fixture.login.logout(entry)
      expect(fixture.http.requests.some(request => request.url.endsWith('/matching'))).to.be.false
    }
  })

  it('deletes all matching non-default raw and redacted authorization IDs', async function () {
    const fixture = logoutFixture([
      response({}),
      response([
        {access_token: {token: entry.token}, id: 'raw'},
        {access_token: {token: 'prefix**********suffix'}, id: 'redacted'},
        {access_token: {token: 'different'}, id: 'other'},
      ]),
      response({access_token: {token: 'default'}}),
      response({}),
      response({}),
    ])
    await fixture.login.logout(entry)
    expect(fixture.http.requests.filter(request => request.options.method === 'DELETE').map(request => request.url)).to.have.members([
      'https://api.heroku.test/oauth/sessions/~',
      'https://api.heroku.test/oauth/authorizations/raw',
      'https://api.heroku.test/oauth/authorizations/redacted',
    ])
  })

  it('retains non-empty prefix-only masks but ignores an ambiguous ten-asterisk mask', async function () {
    const fixture = logoutFixture([
      response({}),
      response([
        {access_token: {token: 'prefix**********'}, id: 'prefix-only'},
        {access_token: {token: '**********'}, id: 'ambiguous'},
      ]),
      response({access_token: {token: 'default'}}),
      response({}),
    ])
    await fixture.login.logout(entry)
    expect(fixture.http.requests.some(request => request.url.endsWith('/prefix-only'))).to.be.true
    expect(fixture.http.requests.some(request => request.url.endsWith('/ambiguous'))).to.be.false
  })

  it('skips all authorization deletion when the default token mask is ambiguous', async function () {
    const fixture = logoutFixture([
      response({}),
      response([
        {access_token: {token: entry.token}, id: 'raw-match'},
        {access_token: {token: 'prefix**********suffix'}, id: 'redacted-match'},
      ]),
      response({access_token: {token: '**********'}}),
    ])
    await fixture.login.logout(entry)
    expect(fixture.http.requests.filter(request => request.options.method === 'DELETE').map(request => request.url)).to.deep.equal([
      'https://api.heroku.test/oauth/sessions/~',
    ])
  })

  it('cleans local storage and login state when entry is absent', async function () {
    const removeAuth = sinon.stub().resolves()
    const deleteLoginState = sinon.stub().resolves()
    const fixture = logoutFixture([], {deleteLoginState, getAuth: sinon.stub().rejects(new Error('missing')), removeAuth})
    await fixture.login.logout()
    expect(fixture.http.requests).to.deep.equal([])
    expect(removeAuth.calledOnceWith(undefined, ['api.heroku.test', 'git.heroku.test'])).to.be.true
    expect(deleteLoginState.calledOnceWith('/fixture/data')).to.be.true
  })

  it('resolves an absent entry from native login state and removes the native credential without remote revocation when auth lookup fails', async function () {
    const removeAuth = sinon.stub().resolves()
    const deleteLoginState = sinon.stub().resolves()
    const getAuth = sinon.stub().rejects(new Error('missing'))
    const fixture = logoutFixture([], {
      deleteLoginState,
      getAuth,
      hasNativeStorage: () => true,
      readLoginState: async () => ({account: 'native@example.com'}),
      removeAuth,
    })
    await fixture.login.logout()
    expect(getAuth.calledOnceWith('native@example.com', 'api.heroku.test')).to.be.true
    expect(removeAuth.calledOnceWith('native@example.com', ['api.heroku.test', 'git.heroku.test'])).to.be.true
    expect(deleteLoginState.calledOnce).to.be.true
    expect(fixture.http.requests).to.deep.equal([])
  })

  it('resolves an absent entry token from native login state before local cleanup and remote revocation', async function () {
    const removeAuth = sinon.stub().resolves()
    const getAuth = sinon.stub().resolves({account: 'native@example.com', token: entry.token})
    const fixture = logoutFixture([response({}), response([], 401)], {
      getAuth,
      hasNativeStorage: () => true,
      readLoginState: async () => ({account: 'native@example.com'}),
      removeAuth,
    })
    await fixture.login.logout()
    expect(getAuth.calledOnceWith('native@example.com', 'api.heroku.test')).to.be.true
    expect(removeAuth.calledOnceWith('native@example.com', ['api.heroku.test', 'git.heroku.test'])).to.be.true
    expect(fixture.http.requests).to.have.length(2)
    expect(fixture.http.requests.every(request => request.options.headers?.authorization === `Bearer ${entry.token}`)).to.be.true
  })

  it('continues broad local cleanup when absent-entry lookup fails without an account', async function () {
    const removeAuth = sinon.stub().resolves()
    const fixture = logoutFixture([], {
      getAuth: sinon.stub().rejects(new Error('missing')),
      hasNativeStorage: () => true,
      async readLoginState() {
        throw new Error('unreadable')
      },
      removeAuth,
    })
    await fixture.login.logout()
    expect(removeAuth.calledOnceWith(undefined, ['api.heroku.test', 'git.heroku.test'])).to.be.true
    expect(fixture.http.requests).to.deep.equal([])
  })

  it('continues broad local cleanup without surfacing absent-entry resolution failures', async function () {
    const removeAuth = sinon.stub().resolves()
    const fixture = logoutFixture([], {
      getAuth: sinon.stub().rejects(new Error('auth lookup failed')),
      hasNativeStorage: () => true,
      readLoginState: async () => ({account: 'native@example.com'}),
      removeAuth,
    })
    await fixture.login.logout()
    expect(removeAuth.calledOnceWith('native@example.com', ['api.heroku.test', 'git.heroku.test'])).to.be.true
    expect(fixture.http.requests).to.deep.equal([])
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

  it('bounds hanging absent-entry state resolution and starts broad local cleanup at the logout timeout', async function () {
    const timers = fakeTimers()
    const removeAuth = sinon.stub().resolves()
    const getAuth = sinon.stub().resolves(entry)
    const fixture = loginFixture({
      storage: storage({
        getAuth,
        hasNativeStorage: () => true,
        readLoginState: async () => new Promise(() => {}),
        removeAuth,
      }),
      timers,
    })
    const operation = fixture.login.logout()
    await Promise.resolve()
    expect(removeAuth.notCalled).to.be.true
    timers.fire()
    await expect(operation).to.be.rejectedWith('Logout timed out')
    expect(removeAuth.calledOnceWith(undefined, ['api.heroku.test', 'git.heroku.test'])).to.be.true
    expect(getAuth.notCalled).to.be.true
    expect(fixture.http.requests).to.deep.equal([])
    expect(timers.pending).to.equal(0)
  })

  it('uses a resolved account hint when auth lookup hangs until the logout timeout', async function () {
    const timers = fakeTimers()
    const removeAuth = sinon.stub().resolves()
    const getAuth = sinon.stub().returns(new Promise(() => {}))
    const fixture = loginFixture({
      storage: storage({
        getAuth,
        hasNativeStorage: () => true,
        readLoginState: async () => ({account: ' native@example.com '}),
        removeAuth,
      }),
      timers,
    })
    const operation = fixture.login.logout()
    while (getAuth.notCalled) await Promise.resolve()
    timers.fire()
    await expect(operation).to.be.rejectedWith('Logout timed out')
    expect(removeAuth.calledOnceWith('native@example.com', ['api.heroku.test', 'git.heroku.test'])).to.be.true
    expect(fixture.http.requests).to.deep.equal([])
    expect(timers.pending).to.equal(0)
  })

  it('preserves custom API ports for logout HTTP and credential cleanup', async function () {
    for (const apiUrl of ['https://custom-api.example.test:8443', 'https://custom-api.example.test:443', 'http://localhost:4567', 'http://[::1]:4567']) {
      const removeAuth = sinon.stub().resolves()
      const fixture = loginFixture({config: {apiUrl}, storage: storage({removeAuth})})
      fixture.http.responses.push(response({}), response([], 401))
      await fixture.login.logout(entry)
      const normalizedApiUrl = new URL(apiUrl).href.replace(/\/$/, '')
      expect(fixture.http.requests.map(request => request.url)).to.have.members([
        `${normalizedApiUrl}/oauth/sessions/~`,
        `${normalizedApiUrl}/oauth/authorizations`,
      ])
      const explicitPort = apiUrl.match(/:(\d+)$/)?.[1]
      const expectedHost = `${new URL(apiUrl).hostname}${explicitPort ? `:${explicitPort}` : ''}`
      expect(removeAuth.calledOnceWith(entry.account, [expectedHost, 'git.heroku.com'])).to.be.true
    }
  })

  it('guarantees local cleanup and then surfaces unexpected remote errors', async function () {
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

  it('scrubs the native account hint from absent-entry cleanup failures', async function () {
    const accountHint = 'hint-secret@example.com'
    const adapterError = Object.assign(new Error(`remove failed for ${accountHint}`), {
      body: {account: accountHint},
      cause: {account: accountHint},
    })
    const fixture = logoutFixture([], {
      getAuth: sinon.stub().rejects(new Error('missing')),
      hasNativeStorage: () => true,
      readLoginState: async () => ({account: accountHint}),
      removeAuth: sinon.stub().rejects(adapterError),
    })

    const error = await fixture.login.logout().then(() => {
      throw new Error('Expected failure')
    }, error => error as Error)
    expect(error).to.not.equal(adapterError)
    expect(error.message).to.equal('remove failed for [SCRUBBED]')
    expect(error.cause).to.equal(undefined)
    expect(error).to.not.have.property('body')
    expectSafeErrorSurface(error, [accountHint])
  })
})

/* eslint-enable camelcase, mocha/max-top-level-suites, no-await-in-loop, unicorn/consistent-function-scoping */
