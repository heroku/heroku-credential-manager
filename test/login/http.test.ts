import {expect, use} from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinon from 'sinon'

import type {HerokuApiClientLike, HerokuApiRequestOptions, HerokuApiResponse} from '../../src/login/index.js'

import {
  fetchGet,
  fetchJsonPost,
  herokuApiDelete,
  herokuApiGet,
  LoginRequestError,
  normalizeLoginRequestError,
} from '../../src/login/http.js'

use(chaiAsPromised)

function response<T>(body: T, status = 200, headers: Record<string, string> = {}): HerokuApiResponse<T> {
  return {body, headers, status}
}

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

async function rejected(operation: Promise<unknown>): Promise<Error> {
  return operation.then(() => {
    throw new Error('Expected failure')
  }, error => error as Error)
}

async function requestError(thrown: unknown, sensitiveValues: readonly string[] = []): Promise<Error> {
  const api: HerokuApiClientLike = {
    async delete() {
      throw thrown
    },
    async get() {
      throw thrown
    },
  }
  return rejected(herokuApiGet(api, '/account', undefined, sensitiveValues))
}

describe('login requests', function () {
  describe('errors', function () {
    it('preserves safe status-less transport diagnostics', async function () {
      const cause = new Error('certificate authority unavailable')
      const transportError = new Error('proxy certificate rejected', {cause})
      transportError.name = 'ProxyError'

      expect(normalizeLoginRequestError(transportError)).to.equal(transportError)
      const errors = await Promise.all([['request-secret'], []].map(sensitiveValues => requestError(transportError, sensitiveValues)))
      for (const error of errors) {
        expect(error).to.not.equal(transportError)
        expect(error).to.include({message: 'proxy certificate rejected', name: 'ProxyError'})
        expect(error.cause).to.be.instanceOf(Error).and.not.equal(cause)
        expect(error.cause).to.include({message: 'certificate authority unavailable', name: 'Error'})
        expect(Object.keys(error)).to.deep.equal(['name'])
      }
    })

    it('always drops status-less adapter metadata, AggregateError errors, and object causes', async function () {
      const transportError = Object.assign(new AggregateError([
        new Error('nested adapter diagnostic'),
      ], 'safe proxy failure', {cause: {authorization: 'ambient-adapter-credential'}}), {
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
      const error = normalizeLoginRequestError(injected) as LoginRequestError
      expect(error).to.be.instanceOf(LoginRequestError)
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

    it('drops arbitrary adapter metadata when credentials were supplied', async function () {
      const sensitiveValue = 'metadata-token'
      const transportError = Object.assign(new Error('proxy certificate rejected'), {
        config: {headers: {authorization: `Bearer ${sensitiveValue}`}},
        request: {headers: {'x-api-key': sensitiveValue}},
        response: {body: sensitiveValue},
      })

      const error = await requestError(transportError, [sensitiveValue])
      expect(error.message).to.equal('proxy certificate rejected')
      expect(error).to.not.have.any.keys('config', 'request', 'response')
      expectNoSensitiveSurface(error, sensitiveValue)
    })

    it('scrubs direct LoginRequestError messages and bodies supplied by clients', async function () {
      const sensitiveValue = 'direct-request-token'
      const thrown = new LoginRequestError(403, {
        id: `forbidden-${sensitiveValue}`,
        message: `Credential ${sensitiveValue} denied`,
        resource: sensitiveValue,
      })

      const error = await requestError(thrown, [sensitiveValue]) as LoginRequestError
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
      const error = await requestError(new Error('proxy certificate rejected', {
        cause: {headers: {authorization: sensitiveValue}, message: sensitiveValue},
      }), [sensitiveValue])
      expect(error.message).to.equal('proxy certificate rejected')
      expect(error.cause).to.equal(undefined)
      expectNoSensitiveSurface(error, sensitiveValue)
    })

    it('projects AggregateError without preserving its raw errors collection', async function () {
      const sensitiveValue = 'aggregate-token'
      const error = await requestError(new AggregateError([
        new Error(`upstream exposed ${sensitiveValue}`),
        {token: sensitiveValue},
      ], 'proxy certificate rejected', {cause: `TLS relay ${sensitiveValue}`}), [sensitiveValue])
      expect(error).to.not.be.instanceOf(AggregateError)
      expect(error.message).to.equal('proxy certificate rejected')
      expect(error.cause).to.equal('TLS relay [SCRUBBED]')
      expect(error).to.not.have.property('errors')
      expectNoSensitiveSurface(error, sensitiveValue)
    })

    it('scrubs allowlisted non-2xx response fields before constructing the public error', async function () {
      const sensitiveValue = 'response-token'
      const api: HerokuApiClientLike = {
        async delete<T>() {
          return response(undefined, 204) as HerokuApiResponse<T>
        },
        async get<T>() {
          return response({
            id: `unauthorized-${sensitiveValue}`,
            message: `Credential ${sensitiveValue} rejected`,
            resource: `authorization/${sensitiveValue}`,
            secret: sensitiveValue,
          }, 401) as HerokuApiResponse<T>
        },
      }
      const error = await rejected(herokuApiGet(api, '/account', undefined, [sensitiveValue])) as LoginRequestError
      expect(error).to.be.instanceOf(LoginRequestError)
      expect(error.message).to.equal('Credential [SCRUBBED] rejected\nError ID: unauthorized-[SCRUBBED]')
      expect(error.body).to.deep.equal({
        id: 'unauthorized-[SCRUBBED]',
        message: 'Credential [SCRUBBED] rejected',
        resource: 'authorization/[SCRUBBED]',
      })
      expect(error.body).to.not.have.property('secret')
      expectNoSensitiveSurface(error, sensitiveValue)
    })

    it('scrubs injected status error bodies and ignores raw client messages', async function () {
      const sensitiveValue = 'status-token'
      const withBody = Object.assign(new Error(`client exposed ${sensitiveValue}`), {
        body: {message: `Authorization rejected for ${sensitiveValue}`},
        request: {headers: {authorization: sensitiveValue}},
        status: 401,
      })
      const usefulError = await requestError(withBody, [sensitiveValue]) as LoginRequestError
      expect(usefulError.message).to.equal('Authorization rejected for [SCRUBBED]')
      expect(usefulError.body).to.deep.equal({message: 'Authorization rejected for [SCRUBBED]'})
      expect(usefulError).to.not.have.property('request')
      expectNoSensitiveSurface(usefulError, sensitiveValue)

      const withoutBody = Object.assign(new Error(`client exposed ${sensitiveValue}`), {statusCode: 502})
      const genericError = await requestError(withoutBody, [sensitiveValue]) as LoginRequestError
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
        // Non-Error objects are not trusted even when shaped like client request errors.
        // eslint-disable-next-line no-await-in-loop
        const error = await requestError(thrown, [sensitiveValue])
        expect(error).to.be.instanceOf(Error)
        expect(error.message).to.not.contain(sensitiveValue)
        expect(error).to.not.have.any.keys('config', 'request', 'response')
        expectNoSensitiveSurface(error, sensitiveValue)
      }
    })
  })

  describe('Heroku API client', function () {
    it('uses get and delete with normalized options and responses', async function () {
      const get = sinon.stub().resolves(response({email: 'test@example.com'}))
      const deleteRequest = sinon.stub().resolves(response(undefined, 204))
      const api: HerokuApiClientLike = {delete: deleteRequest, get}
      const controller = new AbortController()

      expect(await herokuApiGet(api, '/account', {headers: {Range: 'id ..;'}, signal: controller.signal, timeoutMs: 10})).to.deep.equal(response({email: 'test@example.com'}))
      expect(await herokuApiDelete(api, '/oauth/sessions/~', {signal: controller.signal, timeoutMs: 10})).to.deep.equal(response(undefined, 204))
      expect(get.calledOnceWith('/account', {headers: {Range: 'id ..;'}, signal: controller.signal, timeoutMs: 10})).to.be.true
      expect(deleteRequest.calledOnceWith('/oauth/sessions/~', {signal: controller.signal, timeoutMs: 10})).to.be.true
    })

    it('preserves Range and Next-Range response metadata', async function () {
      const api: HerokuApiClientLike = {
        delete: async <T>() => response(null) as HerokuApiResponse<T>,
        get: async <T>(_path: string, options?: HerokuApiRequestOptions) => response([], 206, {'Next-Range': options?.headers?.Range ?? 'next-range'}) as HerokuApiResponse<T>,
      }
      const result = await herokuApiGet(api, '/oauth/authorizations', {headers: {Range: 'verbatim range'}})
      expect(result.status).to.equal(206)
      expect(result.headers['Next-Range']).to.equal('verbatim range')
    })

    it('propagates cancellation signals and request timeouts to get and delete', async function () {
      const controller = new AbortController()
      const get = sinon.stub().callsFake(async (_path: string, options) => new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {once: true})
      }))
      const deleteRequest = sinon.stub().callsFake(async (_path: string, options) => new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {once: true})
      }))
      const api = {delete: deleteRequest, get} as HerokuApiClientLike
      const getOperation = herokuApiGet(api, '/account', {signal: controller.signal, timeoutMs: 123})
      const deleteOperation = herokuApiDelete(api, '/oauth/sessions/~', {signal: controller.signal, timeoutMs: 123})
      const reason = new Error('operation cancelled')
      controller.abort(reason)
      await expect(getOperation).to.be.rejectedWith('operation cancelled')
      await expect(deleteOperation).to.be.rejectedWith('operation cancelled')
      expect(get.firstCall.args[1]).to.include({signal: controller.signal, timeoutMs: 123})
      expect(deleteRequest.firstCall.args[1]).to.include({signal: controller.signal, timeoutMs: 123})
    })
  })

  describe('fetch', function () {
    afterEach(function () {
      sinon.restore()
    })

    it('resolves and binds global fetch lazily when no fetch implementation is injected', async function () {
      const globalFetch = sinon.stub(globalThis, 'fetch').resolves(new Response(JSON.stringify({source: 'global'}), {
        headers: {'content-type': 'application/json', 'x-fetch-source': 'global'},
        status: 202,
      }))

      try {
        const result = await fetchGet<{source: string}>(undefined, 'https://login.heroku.test/global', {
          headers: {'x-request-source': 'default-fetch'},
        })

        expect(globalFetch.calledOnce).to.be.true
        expect(globalFetch.firstCall.thisValue).to.equal(globalThis)
        expect(globalFetch.firstCall.args[0]).to.equal('https://login.heroku.test/global')
        const options = globalFetch.firstCall.args[1] as RequestInit
        expect(options).to.include({method: 'GET', redirect: 'error'})
        expect(options.headers).to.deep.include({'x-request-source': 'default-fetch'})
        expect(options.signal).to.be.instanceOf(AbortSignal)
        expect(result).to.deep.equal({
          body: {source: 'global'},
          headers: {'content-type': 'application/json', 'x-fetch-source': 'global'},
          status: 202,
        })
      } finally {
        globalFetch.restore()
      }
    })

    it('serializes POST JSON, merges headers, and returns JSON response metadata', async function () {
      const fetchStub = sinon.stub().resolves(new Response(JSON.stringify({ok: true}), {
        headers: {'content-type': 'application/json', 'x-request-id': 'request-id'},
        status: 201,
      }))
      const result = await fetchJsonPost<{ok: boolean}>(fetchStub, 'https://api.heroku.test/example', {name: 'example'}, {
        headers: {authorization: 'Bearer token', 'content-type': 'application/custom+json'},
      })

      expect(result).to.deep.include({body: {ok: true}, status: 201})
      expect(result.headers['x-request-id']).to.equal('request-id')
      const options = fetchStub.firstCall.args[1] as RequestInit
      expect(options.body).to.equal('{"name":"example"}')
      expect(options.headers).to.deep.include({authorization: 'Bearer token', 'content-type': 'application/custom+json'})
      expect(options.method).to.equal('POST')
      expect(options.redirect).to.equal('error')
    })

    it('adds the package User-Agent and allows callers to override it', async function () {
      const fetchStub = sinon.stub().callsFake(async () => new Response('{}', {status: 200}))
      await fetchJsonPost(fetchStub, 'https://api.heroku.test/default', {})
      await fetchJsonPost(fetchStub, 'https://api.heroku.test/override', {}, {headers: {'User-Agent': 'heroku-cli/test'}})

      expect(fetchStub.firstCall.args[1].headers).to.have.property('user-agent').that.matches(/^@heroku\/heroku-credential-manager\/.+ node-v/)
      expect(fetchStub.secondCall.args[1].headers).to.include({'User-Agent': 'heroku-cli/test'})
      expect(fetchStub.secondCall.args[1].headers).to.not.have.property('user-agent')
    })

    it('returns text and empty response bodies without adding a content type for GET', async function () {
      const fetchStub = sinon.stub()
      fetchStub.onFirstCall().resolves(new Response('plain text', {status: 200}))
      fetchStub.onSecondCall().resolves(new Response(null, {status: 204}))
      expect(await fetchGet<string>(fetchStub, 'https://login.heroku.test/text')).to.deep.include({body: 'plain text', status: 200})
      expect(await fetchGet<undefined>(fetchStub, 'https://login.heroku.test/empty')).to.deep.include({body: undefined, status: 204})
      expect(fetchStub.firstCall.args[1].headers).to.not.have.property('content-type')
    })

    it('normalizes non-2xx fetch responses', async function () {
      const fetchStub = sinon.stub().resolves(new Response(JSON.stringify({id: 'denied', message: 'No access'}), {status: 403}))
      const error = await rejected(fetchJsonPost(fetchStub, 'https://api.heroku.test/example', {})) as LoginRequestError
      expect(error).to.be.instanceOf(LoginRequestError)
      expect(error).to.include({id: 'denied', message: 'No access\nError ID: denied', status: 403})
    })

    it('propagates parent abort reasons and removes the parent listener for GET and POST', async function () {
      for (const request of [
        (fetchStub: typeof fetch, signal: AbortSignal) => fetchGet(fetchStub, 'https://login.heroku.test/poll', {signal}),
        (fetchStub: typeof fetch, signal: AbortSignal) => fetchJsonPost(fetchStub, 'https://login.heroku.test/auth', {}, {signal}),
      ]) {
        const parent = new AbortController()
        const add = sinon.spy(parent.signal, 'addEventListener')
        const remove = sinon.spy(parent.signal, 'removeEventListener')
        const fetchStub = sinon.stub().callsFake(async (_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(options.signal?.reason), {once: true})
        })) as unknown as typeof fetch
        const operation = request(fetchStub, parent.signal)
        parent.abort(new Error('parent stopped'))
        // eslint-disable-next-line no-await-in-loop
        await expect(operation).to.be.rejectedWith('parent stopped')
        expect(add.calledOnce).to.be.true
        expect(remove.calledOnceWith('abort')).to.be.true
      }
    })

    it('aborts GET and POST on per-request timeout and clears timers', async function () {
      const clock = sinon.useFakeTimers()
      const signals: AbortSignal[] = []
      const abortReasons: unknown[] = []
      const fetchStub = sinon.stub().callsFake(async (_url: string, options: RequestInit) => {
        const {signal} = options
        if (!signal) throw new Error('Expected a request signal')
        signals.push(signal)
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            abortReasons.push(signal.reason)
            reject(signal.reason)
          }, {once: true})
        })
      }) as unknown as typeof fetch
      const requests = [
        fetchGet(fetchStub, 'https://login.heroku.test/poll', {timeoutMs: 10}),
        fetchJsonPost(fetchStub, 'https://login.heroku.test/auth', {}, {timeoutMs: 10}),
      ]
      await Promise.resolve()
      expect(signals).to.have.length(2)
      expect(signals.every(signal => !signal.aborted)).to.be.true
      const rejections = requests.map(request => expect(request).to.be.rejectedWith('Login request timed out'))
      await clock.tickAsync(10)
      await Promise.all(rejections)
      expect(signals.every(signal => signal.aborted)).to.be.true
      expect(abortReasons).to.have.length(2)
      for (const reason of abortReasons) expect(reason).to.be.instanceOf(Error).and.include({message: 'Login request timed out'})
      expect(clock.countTimers()).to.equal(0)
    })

    it('honors each exact caller-provided timeout at the GET and POST helper boundary', async function () {
      const clock = sinon.useFakeTimers()
      const fetchStub = sinon.stub().callsFake(async (_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(options.signal?.reason), {once: true})
      })) as unknown as typeof fetch
      const getOperation = fetchGet(fetchStub, 'https://login.heroku.test/poll', {timeoutMs: 17})
      const postOperation = fetchJsonPost(fetchStub, 'https://login.heroku.test/auth', {}, {timeoutMs: 29})
      const getRejection = expect(getOperation).to.be.rejectedWith('Login request timed out')
      const postRejection = expect(postOperation).to.be.rejectedWith('Login request timed out')
      let postSettled = false
      postOperation.finally(() => {
        postSettled = true
      }).catch(() => {})

      await clock.tickAsync(17)
      await getRejection
      expect(postSettled).to.be.false
      await clock.tickAsync(12)
      await postRejection
      expect(postSettled).to.be.true
      expect(clock.countTimers()).to.equal(0)
    })

    it('clears a pending request timer after success', async function () {
      const clock = sinon.useFakeTimers()
      const fetchStub = sinon.stub().resolves(new Response('{}', {status: 200}))
      await fetchJsonPost(fetchStub, 'https://login.heroku.test/success', {}, {timeoutMs: 10})
      expect(clock.countTimers()).to.equal(0)
    })
  })
})
