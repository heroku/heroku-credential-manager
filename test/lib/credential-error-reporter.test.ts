import {expect} from 'chai'
import sinon from 'sinon'

import {reportCredentialError, setCredentialErrorReporter} from '../../src/lib/credential-error-reporter.js'
import {CredentialStore} from '../../src/lib/credential-storage-selector.js'

const context = {credentialStore: CredentialStore.MacOSKeychain, operation: 'getAuth'} as const

describe('credential-error-reporter', function () {
  afterEach(function () {
    setCredentialErrorReporter(undefined)
  })

  it('invokes the registered reporter with the error and context', async function () {
    const reporter = sinon.stub().resolves()
    setCredentialErrorReporter(reporter)
    const error = new Error('boom')

    await reportCredentialError(error, context)

    expect(reporter.calledOnce).to.be.true
    expect(reporter.firstCall.args[0]).to.equal(error)
    expect(reporter.firstCall.args[1]).to.deep.equal(context)
  })

  it('is a no-op when no reporter is registered', async function () {
    await reportCredentialError(new Error('x'), context)
  })

  it('accepts a synchronous reporter that returns a value', async function () {
    const seen: unknown[] = []
    // Compile-time guard: a reporter whose body returns a non-void value (here
    // Array.prototype.push returns a number) must satisfy CredentialErrorReporter.
    setCredentialErrorReporter(error => seen.push(error))
    const error = new Error('boom')

    await reportCredentialError(error, context)

    expect(seen).to.deep.equal([error])
  })

  it('swallows errors thrown by the reporter', async function () {
    setCredentialErrorReporter(() => {
      throw new Error('reporter failed')
    })

    await reportCredentialError(new Error('x'), context)
  })

  it('swallows rejections from an async reporter', async function () {
    setCredentialErrorReporter(async () => {
      throw new Error('reporter rejected')
    })

    await reportCredentialError(new Error('x'), context)
  })

  it('returns the previously registered reporter when replacing it', function () {
    const first = sinon.stub()
    const second = sinon.stub()

    expect(setCredentialErrorReporter(first)).to.equal(undefined)
    expect(setCredentialErrorReporter(second)).to.equal(first)
    expect(setCredentialErrorReporter(undefined)).to.equal(second)
  })
})
