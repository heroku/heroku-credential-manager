import {expect} from 'chai'
import sinon from 'sinon'

import {LinuxHandler} from '../src/credential-handlers/linux-handler.js'
import {MacOSHandler} from '../src/credential-handlers/macos-handler.js'
import {NetrcHandler} from '../src/credential-handlers/netrc-handler.js'
import {WindowsHandler} from '../src/credential-handlers/windows-handler.js'
import * as credentialManager from '../src/index.js'
import {CredentialStore} from '../src/lib/credential-storage-selector.js'

describe('credential-manager', function () {
  beforeEach(function () {
    sinon.stub(process, 'platform').value('darwin')
    const env = {...process.env}
    sinon.stub(process, 'env').value(env)
    delete env.HEROKU_NETRC_WRITE
  })

  afterEach(function () {
    sinon.restore()
  })

  describe('saveAuth', function () {
    it('should save to both credential store and netrc', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'saveAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'saveAuth').resolves()

      await credentialManager.saveAuth('user@example.com', 'test-token', ['api.heroku.com'])

      expect(macosStub.calledOnce).to.be.true
      expect(macosStub.firstCall.args[0]).to.deep.equal({
        account: 'user@example.com',
        service: 'heroku-cli',
        token: 'test-token',
      })
      expect(netrcStub.calledOnce).to.be.true
      expect(netrcStub.firstCall.args[0]).to.deep.equal({
        login: 'user@example.com',
        password: 'test-token',
      })
      expect(netrcStub.firstCall.args[1]).to.equal('api.heroku.com')
    })

    it('should continue to netrc if credential store fails', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'saveAuth').throws(new Error('Keychain error'))
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'saveAuth').resolves()

      await credentialManager.saveAuth('user@example.com', 'test-token', ['api.heroku.com'])

      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledOnce).to.be.true
    })

    it('should save to credential store once and netrc multiple times for multiple hosts', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'saveAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'saveAuth').resolves()

      await credentialManager.saveAuth('user@example.com', 'test-token', ['api.heroku.com', 'git.heroku.com'])

      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledTwice).to.be.true
      expect(netrcStub.firstCall.args[1]).to.equal('api.heroku.com')
      expect(netrcStub.secondCall.args[1]).to.equal('git.heroku.com')
    })
  })

  describe('getAuth', function () {
    it('should retrieve from credential store when available', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'getAuth').returns('keychain-token')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'getAuth')

      const token = await credentialManager.getAuth('user@example.com', 'api.heroku.com')

      expect(token).to.equal('keychain-token')
      expect(macosStub.calledOnce).to.be.true
      expect(macosStub.firstCall.args[0]).to.equal('user@example.com')
      expect(netrcStub.notCalled).to.be.true
    })

    it('should fall back to netrc if credential store fails', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'getAuth').throws(new Error('Keychain error'))
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'getAuth')
      netrcStub.resolves({login: 'user@example.com', password: 'netrc-token'})

      const token = await credentialManager.getAuth('user@example.com', 'api.heroku.com')

      expect(token).to.equal('netrc-token')
      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledOnce).to.be.true
      expect(netrcStub.firstCall.args[0]).to.equal('api.heroku.com')
    })

    it('should throw error when credentials are not found in either location', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'getAuth').throws(new Error('Not found'))
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'getAuth')
      netrcStub.rejects(new Error('No auth found for api.heroku.com'))

      try {
        await credentialManager.getAuth('user@example.com', 'api.heroku.com')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.equal('No auth found for api.heroku.com')
      }

      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledOnce).to.be.true
    })

    it('should throw error when netrc password is empty', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'getAuth').throws(new Error('Not found'))
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'getAuth')
      netrcStub.resolves({login: 'user@example.com', password: undefined as any})

      try {
        await credentialManager.getAuth('user@example.com', 'api.heroku.com')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.equal('No credentials found. Please log in.')
      }

      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledOnce).to.be.true
    })
  })

  describe('removeAuth', function () {
    it('should remove from both credential store and netrc', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'removeAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'removeAuth').resolves()

      await credentialManager.removeAuth('user@example.com', ['api.heroku.com'])

      expect(macosStub.calledOnce).to.be.true
      expect(macosStub.firstCall.args[0]).to.equal('user@example.com')
      expect(netrcStub.calledOnce).to.be.true
      expect(netrcStub.firstCall.args[0]).to.equal('api.heroku.com')
    })

    it('should continue to netrc if credential store fails', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'removeAuth').throws(new Error('Keychain error'))
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'removeAuth').resolves()

      await credentialManager.removeAuth('user@example.com', ['api.heroku.com'])

      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledOnce).to.be.true
    })

    it('should remove from credential store once and netrc multiple times for multiple hosts', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'removeAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'removeAuth').resolves()

      await credentialManager.removeAuth('user@example.com', ['api.heroku.com', 'git.heroku.com'])

      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledTwice).to.be.true
      expect(netrcStub.firstCall.args[0]).to.equal('api.heroku.com')
      expect(netrcStub.secondCall.args[0]).to.equal('git.heroku.com')
    })
  })

  describe('getCredentialHandler', function () {
    it('should return the correct credential handler for the given store', function () {
      let handler = credentialManager.getCredentialHandler(CredentialStore.MacOSKeychain)
      expect(handler).to.be.instanceOf(MacOSHandler)

      handler = credentialManager.getCredentialHandler(CredentialStore.WindowsCredentialManager)
      expect(handler).to.be.instanceOf(WindowsHandler)

      handler = credentialManager.getCredentialHandler(CredentialStore.LinuxSecretService)
      expect(handler).to.be.instanceOf(LinuxHandler)
    })
  })
})
