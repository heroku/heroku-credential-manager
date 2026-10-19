import {expect, use} from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinon from 'sinon'

import {MacOSHandler} from '../src/credential-handlers/macos-handler.js'
import {NetrcHandler} from '../src/credential-handlers/netrc-handler.js'
import * as credentialManager from '../src/index.js'
import {CredentialStore} from '../src/lib/credential-storage-selector.js'
import {NativeCredentialNotFoundError} from '../src/native-credential-not-found-error.js'

use(chaiAsPromised)

describe('native credential error reporting', function () {
  let reporter: sinon.SinonStub

  beforeEach(function () {
    sinon.stub(process, 'platform').value('darwin')
    const env = {...process.env}
    sinon.stub(process, 'env').value(env)
    delete env.HEROKU_NETRC_WRITE

    reporter = sinon.stub().resolves()
    credentialManager.setCredentialErrorReporter(reporter)
  })

  afterEach(function () {
    credentialManager.setCredentialErrorReporter(undefined)
    sinon.restore()
  })

  it('reports a native saveAuth failure (operation saveAuth) and still falls back to netrc', async function () {
    const failure = new Error('keychain write failed')
    sinon.stub(MacOSHandler.prototype, 'saveAuth').throws(failure)
    const netrcSave = sinon.stub(NetrcHandler.prototype, 'saveAuthForHosts').resolves()

    await credentialManager.saveAuth('user@example.com', 'test-token', ['api.heroku.com'])

    expect(netrcSave.calledOnce).to.be.true
    expect(reporter.calledOnce).to.be.true
    expect(reporter.firstCall.args[0]).to.equal(failure)
    expect(reporter.firstCall.args[1]).to.deep.equal({
      credentialStore: CredentialStore.MacOSKeychain,
      operation: 'saveAuth',
    })
  })

  it('reports a non-miss getAuth failure before rethrowing', async function () {
    const failure = new Error('Keychain unavailable')
    sinon.stub(MacOSHandler.prototype, 'getAuth').throws(failure)
    const netrcGet = sinon.stub(NetrcHandler.prototype, 'getAuth')

    await expect(credentialManager.getAuth('user@example.com', 'api.heroku.com'))
      .to.be.rejectedWith(Error, 'Keychain unavailable')
    expect(netrcGet.notCalled).to.be.true
    expect(reporter.calledOnce).to.be.true
    expect(reporter.firstCall.args[1]).to.deep.equal({
      credentialStore: CredentialStore.MacOSKeychain,
      operation: 'getAuth',
    })
  })

  it('does not report an expected NativeCredentialNotFoundError miss from getAuth', async function () {
    sinon.stub(MacOSHandler.prototype, 'getAuth').throws(new NativeCredentialNotFoundError('Not found'))
    sinon.stub(NetrcHandler.prototype, 'getAuth').resolves({login: 'user@example.com', password: 'netrc-token'})

    const auth = await credentialManager.getAuth('user@example.com', 'api.heroku.com')

    expect(auth).to.deep.equal({account: 'user@example.com', token: 'netrc-token'})
    expect(reporter.notCalled).to.be.true
  })

  it('reports a native removeAuth failure (operation removeAuth) and still cleans netrc', async function () {
    const failure = new Error('keychain delete failed')
    sinon.stub(MacOSHandler.prototype, 'getAuth').returns('stored-token')
    sinon.stub(MacOSHandler.prototype, 'removeAuth').throws(failure)
    const netrcRemove = sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

    await credentialManager.removeAuth('user@example.com', ['api.heroku.com'])

    expect(netrcRemove.calledOnce).to.be.true
    expect(reporter.calledOnce).to.be.true
    expect(reporter.firstCall.args[0]).to.equal(failure)
    expect(reporter.firstCall.args[1]).to.deep.equal({
      credentialStore: CredentialStore.MacOSKeychain,
      operation: 'removeAuth',
    })
  })

  it('reports a native listKeychainAccounts failure (operation listKeychainAccounts) and returns an empty list', async function () {
    const failure = new Error('enumeration failed')
    sinon.stub(MacOSHandler.prototype, 'listAccounts').throws(failure)

    const accounts = await credentialManager.listKeychainAccounts()

    expect(accounts).to.deep.equal([])
    expect(reporter.calledOnce).to.be.true
    expect(reporter.firstCall.args[1]).to.deep.equal({
      credentialStore: CredentialStore.MacOSKeychain,
      operation: 'listKeychainAccounts',
    })
  })
})
