import {expect} from 'chai'
import {createRequire} from 'node:module'
import sinon from 'sinon'

import type {LoginHttp} from '../../src/login/index.js'

import {
  FetchLoginHttp, LoginHttpError, checkedRequest, normalizeLoginHttpError,
} from '../../src/login/http.js'

const require = createRequire(import.meta.url)
const packageMetadata = require('../../package.json') as {name: string, version: string}
const expectedUserAgent = `${packageMetadata.name}/${packageMetadata.version} node-${process.version}`

function expectNoSensitiveSurface(error: Error, sensitiveValue: string): void {
  const inspected: string[] = []
  const seen = new Set<Error>()
  let current: unknown = error
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current)
    inspected.push(String(current), JSON.stringify(current), current.message, current.name)
    current = current.cause
  }

  if (typeof current === 'string') inspected.push(current)
  expect(inspected.join('\n')).to.not.include(sensitiveValue)
}

describe('login HTTP', function () {
  describe('errors', function () {
    const requestUrl = 'https://api.heroku.test/account'

    async function requestError(thrown: unknown, sensitiveValues: readonly string[] = []): Promise<Error> {
      const http: LoginHttp = {
        async request() {
          throw thrown
        },
      }
      return checkedRequest(http, requestUrl, {method: 'GET'}, sensitiveValues).then(() => {
        throw new Error('Expected failure')
      }, error => error as Error)
    }

    it('preserves safe status-less transport diagnostics', async function () {
      const cause = new Error('certificate authority unavailable')
      const transportError = new Error('proxy certificate rejected', {cause})
      transportError.name = 'ProxyError'

      expect(normalizeLoginHttpError(transportError)).to.equal(transportError)
      const error = await requestError(transportError, ['request-secret'])
      expect(error).to.not.equal(transportError)
      expect(error).to.include({message: 'proxy certificate rejected', name: 'ProxyError'})
      expect(error.cause).to.be.instanceOf(Error).and.not.equal(cause)
      expect(error.cause).to.include({message: 'certificate authority unavailable', name: 'Error'})
      expect(Object.keys(error)).to.deep.equal(['name'])

      const projected = await requestError(transportError)
      expect(projected).to.not.equal(transportError)
      expect(projected).to.include({message: 'proxy certificate rejected', name: 'ProxyError'})
      expect(projected.cause).to.be.instanceOf(Error).and.not.equal(cause)
      expect(projected.cause).to.include({message: 'certificate authority unavailable', name: 'Error'})
      expect(Object.keys(projected)).to.deep.equal(['name'])
    })

    it('always drops status-less adapter metadata, AggregateError errors, and object causes', async function () {
      const objectCause = {authorization: 'ambient-adapter-credential'}
      const transportError = Object.assign(new AggregateError([
        new Error('nested adapter diagnostic'),
      ], 'safe proxy failure', {cause: objectCause}), {
        body: {token: 'server-issued-credential'},
        config: {authorization: 'ambient-adapter-credential'},
        response: {credential: 'server-issued-credential'},
      })

      const error = await requestError(transportError)
      expect(error).to.not.equal(transportError)
      expect(error).to.not.be.instanceOf(AggregateError)
      expect(error.message).to.equal('safe proxy failure')
      expect(error.cause).to.equal(undefined)
      expect(error).to.not.have.any.keys('body', 'config', 'errors', 'response')
      expect(JSON.stringify(error)).to.equal('{"name":"AggregateError"}')
    })

    it('normalizes status/body errors to allowlisted public fields', function () {
      const injected = Object.assign(new Error('adapter diagnostic'), {
        body: {
          id: 'unauthorized', message: 'Safe message', resource: 'authorization', secret: 'hidden',
        },
        extra: 'discarded',
        statusCode: 401,
      })
      const error = normalizeLoginHttpError(injected) as LoginHttpError
      expect(error).to.be.instanceOf(LoginHttpError)
      expect(error.message).to.equal('Safe message\nError ID: unauthorized')
      expect(error.body).to.deep.equal({id: 'unauthorized', message: 'Safe message', resource: 'authorization'})
      expect(error).to.not.have.property('extra')
    })

    it('redacts newline and base64 variants from transport error messages and causes', async function () {
      const sensitiveValue = 'line one\r\nline two'
      const transportError = new Error(`proxy ${sensitiveValue.replaceAll('\r\n', '\n')}`, {
        cause: new Error(`TLS ${Buffer.from(sensitiveValue).toString('base64')}`),
      })
      const error = await requestError(transportError, [sensitiveValue])
      expect(error.message).to.equal('proxy [SCRUBBED]')
      expect((error.cause as Error).message).to.equal('TLS [SCRUBBED]')
    })

    it('drops arbitrary adapter metadata from status-less errors when credentials were supplied', async function () {
      const sensitiveValue = 'metadata-token'
      const transportError = Object.assign(new Error('proxy certificate rejected'), {
        config: {headers: {authorization: `Bearer ${sensitiveValue}`}},
        request: {headers: {'x-api-key': sensitiveValue}},
        response: {body: sensitiveValue},
      })

      const error = await requestError(transportError, [sensitiveValue])
      expect(error).to.not.equal(transportError)
      expect(error.message).to.equal('proxy certificate rejected')
      expect(error).to.not.have.any.keys('config', 'request', 'response')
      expectNoSensitiveSurface(error, sensitiveValue)
    })

    it('scrubs direct LoginHttpError messages and bodies supplied by adapters', async function () {
      const sensitiveValue = 'direct-http-token'
      const thrown = new LoginHttpError(403, {
        id: `forbidden-${sensitiveValue}`,
        message: `Credential ${sensitiveValue} denied`,
        resource: sensitiveValue,
      })

      const error = await requestError(thrown, [sensitiveValue]) as LoginHttpError
      expect(error).to.not.equal(thrown)
      expect(error.message).to.equal('Credential [SCRUBBED] denied\nError ID: forbidden-[SCRUBBED]')
      expect(error.body).to.deep.equal({
        id: 'forbidden-[SCRUBBED]',
        message: 'Credential [SCRUBBED] denied',
        resource: '[SCRUBBED]',
      })
      expectNoSensitiveSurface(error, sensitiveValue)
    })

    it('omits non-Error object causes rather than retaining their metadata', async function () {
      const sensitiveValue = 'object-cause-token'
      const cause = {headers: {authorization: sensitiveValue}, message: sensitiveValue}
      const transportError = new Error('proxy certificate rejected', {cause})

      const error = await requestError(transportError, [sensitiveValue])
      expect(error.message).to.equal('proxy certificate rejected')
      expect(error.cause).to.equal(undefined)
      expectNoSensitiveSurface(error, sensitiveValue)
    })

    it('projects AggregateError without preserving its raw errors collection', async function () {
      const sensitiveValue = 'aggregate-token'
      const transportError = new AggregateError([
        new Error(`upstream exposed ${sensitiveValue}`),
        {token: sensitiveValue},
      ], 'proxy certificate rejected', {cause: `TLS relay ${sensitiveValue}`})

      const error = await requestError(transportError, [sensitiveValue])
      expect(error).to.not.be.instanceOf(AggregateError)
      expect(error.message).to.equal('proxy certificate rejected')
      expect(error.cause).to.equal('TLS relay [SCRUBBED]')
      expect(error).to.not.have.property('errors')
      expectNoSensitiveSurface(error, sensitiveValue)
    })

    it('scrubs allowlisted non-ok response fields before constructing the public error', async function () {
      const sensitiveValue = 'response-token'
      const http: LoginHttp = {
        async request<T>() {
          return {
            body: {
              id: `unauthorized-${sensitiveValue}`,
              message: `Credential ${sensitiveValue} rejected`,
              resource: `authorization/${sensitiveValue}`,
              secret: sensitiveValue,
            } as T,
            headers: {},
            ok: false,
            status: 401,
          }
        },
      }

      const error = await checkedRequest(http, requestUrl, {method: 'POST'}, [sensitiveValue]).then(() => {
        throw new Error('Expected failure')
      }, error => error as LoginHttpError)
      expect(error).to.be.instanceOf(LoginHttpError)
      expect(error.message).to.equal('Credential [SCRUBBED] rejected\nError ID: unauthorized-[SCRUBBED]')
      expect(error.body).to.deep.equal({
        id: 'unauthorized-[SCRUBBED]',
        message: 'Credential [SCRUBBED] rejected',
        resource: 'authorization/[SCRUBBED]',
      })
      expect(error.body).to.not.have.property('secret')
      expectNoSensitiveSurface(error, sensitiveValue)
    })

    it('scrubs injected status error bodies and ignores raw adapter messages', async function () {
      const sensitiveValue = 'status-token'
      const withBody = Object.assign(new Error(`adapter exposed ${sensitiveValue}`), {
        body: {message: `Authorization rejected for ${sensitiveValue}`},
        request: {headers: {authorization: sensitiveValue}},
        status: 401,
      })
      const usefulError = await requestError(withBody, [sensitiveValue]) as LoginHttpError
      expect(usefulError.message).to.equal('Authorization rejected for [SCRUBBED]')
      expect(usefulError.body).to.deep.equal({message: 'Authorization rejected for [SCRUBBED]'})
      expect(usefulError).to.not.have.property('request')
      expectNoSensitiveSurface(usefulError, sensitiveValue)

      const withoutBody = Object.assign(new Error(`adapter exposed ${sensitiveValue}`), {statusCode: 502})
      const genericError = await requestError(withoutBody, [sensitiveValue]) as LoginHttpError
      expect(genericError.message).to.equal('Login request failed with status 502')
      expect(genericError.body).to.equal(undefined)
      expectNoSensitiveSurface(genericError, sensitiveValue)
    })

    it('bounds cyclic Error cause chains without retaining the cycle', async function () {
      const sensitiveValue = 'cycle-token'
      const first = new Error(`proxy rejected ${sensitiveValue}`)
      const second = new Error('TLS handshake failed', {cause: first})
      Object.defineProperty(first, 'cause', {configurable: true, value: second})

      const error = await requestError(first, [sensitiveValue])
      expect(error.message).to.equal('proxy rejected [SCRUBBED]')
      expect((error.cause as Error).message).to.equal('TLS handshake failed')
      expect(((error.cause as Error).cause as Error).message).to.equal('Cyclic transport error cause')
      expectNoSensitiveSurface(error, sensitiveValue)
    })

    it('converts non-Error thrown values to a generic safe Error', async function () {
      const sensitiveValue = 'thrown-object-token'
      for (const thrown of [
        {body: {message: sensitiveValue}, message: sensitiveValue, status: 401},
        {message: sensitiveValue, request: {token: sensitiveValue}},
      ]) {
        // Non-Error objects are not trusted even when shaped like adapter HTTP errors.
        // eslint-disable-next-line no-await-in-loop
        const error = await requestError(thrown, [sensitiveValue])
        expect(error).to.be.instanceOf(Error)
        expect(error.message).to.equal('Login request failed')
        expect(Object.keys(error)).to.deep.equal([])
        expectNoSensitiveSurface(error, sensitiveValue)
      }
    })
  })

  describe('FetchLoginHttp', function () {
    let originalFetch: typeof globalThis.fetch

    beforeEach(function () {
      originalFetch = globalThis.fetch
    })

    afterEach(function () {
      globalThis.fetch = originalFetch
      sinon.restore()
    })

    it('serializes JSON bodies, merges headers, and returns JSON response metadata', async function () {
      const fetchStub = sinon.stub().resolves(new Response(JSON.stringify({ok: true}), {
        headers: {'content-type': 'application/json', 'x-request-id': 'request-id'},
        status: 201,
      }))
      globalThis.fetch = fetchStub as unknown as typeof fetch

      const result = await new FetchLoginHttp().request<{ok: boolean}>('https://api.heroku.test/example', {
        body: {name: 'example'},
        headers: {authorization: 'Bearer token', 'content-type': 'application/custom+json'},
        method: 'POST',
      })

      expect(result).to.deep.include({body: {ok: true}, ok: true, status: 201})
      expect(result.headers['x-request-id']).to.equal('request-id')
      const options = fetchStub.firstCall.args[1] as RequestInit
      expect(options.body).to.equal('{"name":"example"}')
      expect(options.headers).to.deep.equal({
        authorization: 'Bearer token',
        'content-type': 'application/custom+json',
        'user-agent': expectedUserAgent,
      })
      expect(options.redirect).to.equal('error')
    })

    it('returns text and empty response bodies without adding a content type for bodyless requests', async function () {
      const fetchStub = sinon.stub()
      fetchStub.onFirstCall().resolves(new Response('plain text', {status: 400}))
      fetchStub.onSecondCall().resolves(new Response(null, {status: 204}))
      globalThis.fetch = fetchStub as unknown as typeof fetch

      const http = new FetchLoginHttp()
      expect(await http.request<string>('https://api.heroku.test/text', {method: 'GET'})).to.deep.include({body: 'plain text', ok: false, status: 400})
      expect(await http.request<undefined>('https://api.heroku.test/empty', {method: 'DELETE'})).to.deep.include({body: undefined, ok: true, status: 204})
      expect(fetchStub.firstCall.args[1].headers).to.deep.equal({'user-agent': expectedUserAgent})
      expect(fetchStub.firstCall.args[1].redirect).to.equal('error')
      expect(fetchStub.secondCall.args[1].redirect).to.equal('error')
    })

    it('allows callers to override the package User-Agent', async function () {
      const fetchStub = sinon.stub().resolves(new Response('{}', {status: 200}))
      globalThis.fetch = fetchStub as unknown as typeof fetch

      await new FetchLoginHttp().request('https://api.heroku.test/example', {
        headers: {'User-Agent': 'heroku-cli/test'},
        method: 'GET',
      })

      expect(fetchStub.firstCall.args[1].headers).to.deep.equal({'User-Agent': 'heroku-cli/test'})
      expect(fetchStub.firstCall.args[1].redirect).to.equal('error')
    })

    it('propagates parent abort reasons and removes the parent listener', async function () {
      const parent = new AbortController()
      const add = sinon.spy(parent.signal, 'addEventListener')
      const remove = sinon.spy(parent.signal, 'removeEventListener')
      globalThis.fetch = sinon.stub().callsFake(async (_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(options.signal?.reason), {once: true})
      })) as unknown as typeof fetch

      const request = new FetchLoginHttp().request('https://api.heroku.test/abort', {method: 'GET', signal: parent.signal})
      const reason = new Error('parent stopped')
      parent.abort(reason)
      await expect(request).to.be.rejectedWith('parent stopped')
      expect(add.calledOnce).to.be.true
      expect(remove.calledOnceWith('abort')).to.be.true
    })

    it('aborts on per-request timeout and clears its timer', async function () {
      const clock = sinon.useFakeTimers()
      globalThis.fetch = sinon.stub().callsFake(async (_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(options.signal?.reason), {once: true})
      })) as unknown as typeof fetch

      const request = new FetchLoginHttp().request('https://api.heroku.test/timeout', {method: 'GET', timeoutMs: 10})
      const rejected = expect(request).to.be.rejectedWith('Login request timed out')
      await clock.tickAsync(10)
      await rejected
      expect(clock.countTimers()).to.equal(0)
    })

    it('clears a pending request timer after success', async function () {
      const clock = sinon.useFakeTimers()
      globalThis.fetch = sinon.stub().resolves(new Response('{}', {status: 200})) as unknown as typeof fetch
      await new FetchLoginHttp().request('https://api.heroku.test/success', {method: 'GET', timeoutMs: 10})
      expect(clock.countTimers()).to.equal(0)
    })
  })
})
