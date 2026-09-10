import {expect, use} from 'chai'
import chaiAsPromised from 'chai-as-promised'
import debug from 'debug'
import sinon from 'sinon'

import {LinuxHandler} from '../src/credential-handlers/linux-handler.js'
import {MacOSHandler} from '../src/credential-handlers/macos-handler.js'
import {NetrcHandler} from '../src/credential-handlers/netrc-handler.js'
import {WindowsHandler} from '../src/credential-handlers/windows-handler.js'
import * as credentialManager from '../src/index.js'
import {CredentialStore} from '../src/lib/credential-storage-selector.js'
import {NativeCredentialNotFoundError} from '../src/native-credential-not-found-error.js'

use(chaiAsPromised)

describe('credential-manager', function () {
  // default to use macOS platform for testing
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
    it('should save to credential store only', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'saveAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'saveAuthForHosts').resolves()
      const cleanupStub = sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.saveAuth('user@example.com', 'test-token', ['api.heroku.com'])

      expect(macosStub.calledOnce).to.be.true
      expect(macosStub.firstCall.args[0]).to.deep.equal({
        account: 'user@example.com',
        service: 'heroku-cli',
        token: 'test-token',
      })
      expect(netrcStub.notCalled).to.be.true
      expect(cleanupStub.calledOnceWith(['api.heroku.com'], 'user@example.com')).to.be.true
    })

    it('preserves native save success when no fallback hosts are provided', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'saveAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'saveAuthForHosts').resolves()
      const cleanupStub = sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.saveAuth('user@example.com', 'test-token', [])

      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.notCalled).to.be.true
      expect(cleanupStub.notCalled).to.be.true
    })

    it('throws an actionable error when native save fails without a fallback host', async function () {
      const account = 'sensitive-account@example.com'
      const token = 'sensitive-token'
      sinon.stub(MacOSHandler.prototype, 'saveAuth').throws(new Error(`failed for ${account} with ${token}`))

      const result = credentialManager.saveAuth(account, token, [])
      await expect(result).to.be.rejectedWith(
        Error,
        'Cannot save credentials to netrc: provide at least one valid, non-empty host',
      )
      await result.catch((error: Error) => {
        expect(error.message).to.not.contain(account)
        expect(error.message).to.not.contain(token)
      })
    })

    it('should save to netrc-only when HEROKU_NETRC_WRITE is true', async function () {
      process.env.HEROKU_NETRC_WRITE = 'TRUE'
      const macosStub = sinon.stub(MacOSHandler.prototype, 'saveAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'saveAuthForHosts').resolves()
      const cleanupStub = sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.saveAuth('user@example.com', 'test-token', ['api.heroku.com'])

      expect(macosStub.notCalled).to.be.true
      expect(netrcStub.calledOnce).to.be.true
      expect(cleanupStub.notCalled).to.be.true
    })

    it('throws before claiming success when forced-netrc mode has no hosts', async function () {
      process.env.HEROKU_NETRC_WRITE = 'TRUE'
      const macosStub = sinon.stub(MacOSHandler.prototype, 'saveAuth')

      await expect(credentialManager.saveAuth('user@example.com', 'test-token', []))
        .to.be.rejectedWith(Error, 'Cannot save credentials to netrc: provide at least one valid, non-empty host')
      expect(macosStub.notCalled).to.be.true
    })

    for (const hosts of [[''], ['   '], ['api.heroku.com', '']]) {
      it(`rejects invalid netrc hosts ${JSON.stringify(hosts)}`, async function () {
        process.env.HEROKU_NETRC_WRITE = 'TRUE'

        await expect(credentialManager.saveAuth('user@example.com', 'test-token', hosts))
          .to.be.rejectedWith(Error, 'Cannot save credentials to netrc: provide at least one valid, non-empty host')
      })
    }

    it('should fall back to netrc if credential store fails', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'saveAuth').throws(new Error('Keychain error'))
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'saveAuthForHosts').resolves()
      const cleanupStub = sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.saveAuth('user@example.com', 'test-token', ['api.heroku.com'])

      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledOnce).to.be.true
      expect(cleanupStub.notCalled).to.be.true
    })

    it('should batch all hosts into one netrc save on fallback', async function () {
      sinon.stub(MacOSHandler.prototype, 'saveAuth').throws(new Error('Keychain error'))
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'saveAuthForHosts').resolves()
      const hosts = ['api.heroku.com', 'git.heroku.com']

      await credentialManager.saveAuth('user@example.com', 'test-token', hosts)

      expect(netrcStub.calledOnceWith(
        {login: 'user@example.com', password: 'test-token'},
        hosts,
      )).to.be.true
    })

    it('does not leak account or token in native failure diagnostics', async function () {
      const account = 'sensitive-account@example.com'
      const token = 'sensitive-token'
      const messages: string[] = []
      const originalLog = debug.log
      const originalNamespaces = debug.disable()
      debug.enable('heroku-credential-manager')
      debug.log = (...args: unknown[]) => messages.push(args.map(String).join(' '))
      sinon.stub(MacOSHandler.prototype, 'saveAuth').throws(new Error(`failed for ${account} with ${token}`))
      sinon.stub(NetrcHandler.prototype, 'saveAuthForHosts').resolves()

      try {
        await credentialManager.saveAuth(account, token, ['api.heroku.com'])
      } finally {
        debug.log = originalLog
        debug.enable(originalNamespaces)
      }

      expect(messages.join('\n')).to.not.contain(account)
      expect(messages.join('\n')).to.not.contain(token)
    })

    it('should throw an error when netrc fallback fails', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'saveAuth').throws(new Error('Keychain error'))
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'saveAuthForHosts').throws(new Error('Netrc error'))

      await expect(credentialManager.saveAuth('user@example.com', 'test-token', ['api.heroku.com']))
        .to.be.rejectedWith(Error, 'Netrc error')
      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledOnce).to.be.true
    })

    it('should save to credential store with custom service name', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'saveAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'saveAuthForHosts').resolves()
      sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.saveAuth('user@example.com', 'test-token', ['api.heroku.com'], 'custom-service')

      expect(macosStub.args[0][0]).to.deep.equal({
        account: 'user@example.com',
        service: 'custom-service',
        token: 'test-token',
      })
      expect(netrcStub.notCalled).to.be.true
    })

    it('should reject when stale netrc cleanup fails after a native save', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'saveAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'saveAuthForHosts').resolves()
      sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').rejects(new Error('Netrc cleanup error'))

      await expect(credentialManager.saveAuth('user@example.com', 'test-token', ['api.heroku.com']))
        .to.be.rejectedWith(Error, 'Netrc cleanup error')
      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.notCalled).to.be.true
    })
  })

  describe('getAuth', function () {
    it('should retrieve from credential store when available', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'getAuth').returns('keychain-token')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'getAuth')

      const auth = await credentialManager.getAuth('user@example.com', 'api.heroku.com')

      expect(auth).to.deep.equal({account: 'user@example.com', token: 'keychain-token'})
      expect(macosStub.calledOnce).to.be.true
      expect(macosStub.firstCall.args[0]).to.equal('user@example.com')
      expect(macosStub.firstCall.args[1]).to.equal('heroku-cli')
      expect(netrcStub.notCalled).to.be.true
    })

    it('should retrieve from netrc-only when HEROKU_NETRC_WRITE is true', async function () {
      process.env.HEROKU_NETRC_WRITE = 'TRUE'
      const macosStub = sinon.stub(MacOSHandler.prototype, 'getAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'getAuth').resolves({login: 'user@example.com', password: 'netrc-token'})

      const auth = await credentialManager.getAuth('user@example.com', 'api.heroku.com')

      expect(macosStub.notCalled).to.be.true
      expect(netrcStub.calledOnce).to.be.true
      expect(netrcStub.firstCall.args[0]).to.equal('api.heroku.com')
      expect(auth).to.deep.equal({account: 'user@example.com', token: 'netrc-token'})
    })

    it('rejects a mismatched account in forced-netrc mode', async function () {
      process.env.HEROKU_NETRC_WRITE = 'TRUE'
      const macosStub = sinon.stub(MacOSHandler.prototype, 'getAuth')
      sinon.stub(NetrcHandler.prototype, 'getAuth').resolves({login: 'stored@example.com', password: 'stored-token'})

      await expect(credentialManager.getAuth('requested@example.com', 'api.heroku.com'))
        .to.be.rejectedWith(Error, 'Netrc credential does not match the requested account for host')
      expect(macosStub.notCalled).to.be.true
    })

    it('rejects a netrc account that differs from the requested account', async function () {
      sinon.stub(MacOSHandler.prototype, 'getAuth').throws(new NativeCredentialNotFoundError('Not found'))
      sinon.stub(NetrcHandler.prototype, 'getAuth').resolves({login: 'stored@example.com', password: 'stored-token'})

      await expect(credentialManager.getAuth('requested@example.com', 'api.heroku.com'))
        .to.be.rejectedWith(Error, 'Netrc credential does not match the requested account for host')
    })

    it('should fall back to netrc if the native credential is missing', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'getAuth').throws(new NativeCredentialNotFoundError('Not found'))
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'getAuth')
      netrcStub.resolves({login: 'user@example.com', password: 'netrc-token'})

      const auth = await credentialManager.getAuth('user@example.com', 'api.heroku.com')

      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledOnce).to.be.true
      expect(netrcStub.firstCall.args[0]).to.equal('api.heroku.com')
      expect(auth).to.deep.equal({account: 'user@example.com', token: 'netrc-token'})
    })

    it('should surface native backend errors without reading netrc', async function () {
      const error = new Error('Keychain unavailable')
      sinon.stub(MacOSHandler.prototype, 'getAuth').throws(error)
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'getAuth')

      await expect(credentialManager.getAuth('user@example.com', 'api.heroku.com'))
        .to.be.rejectedWith(Error, 'Keychain unavailable')
      expect(netrcStub.notCalled).to.be.true
    })

    it('should throw error when credentials are not found in either location', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'getAuth').throws(new NativeCredentialNotFoundError('Not found'))
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'getAuth')
      netrcStub.rejects(new Error('No auth found for api.heroku.com'))

      await expect(credentialManager.getAuth('user@example.com', 'api.heroku.com'))
        .to.be.rejectedWith(Error, 'No auth found for api.heroku.com')
      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledOnce).to.be.true
    })

    it('should throw error when netrc password is empty', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'getAuth').throws(new NativeCredentialNotFoundError('Not found'))
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'getAuth')
      netrcStub.resolves({login: 'user@example.com', password: undefined})

      await expect(credentialManager.getAuth('user@example.com', 'api.heroku.com'))
        .to.be.rejectedWith(Error, 'No auth found')
      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledOnce).to.be.true
    })

    it('should throw error when netrc login is empty', async function () {
      sinon.stub(MacOSHandler.prototype, 'getAuth').throws(new NativeCredentialNotFoundError('Not found'))
      sinon.stub(NetrcHandler.prototype, 'getAuth').resolves({login: undefined, password: 'netrc-token'})

      await expect(credentialManager.getAuth('user@example.com', 'api.heroku.com'))
        .to.be.rejectedWith(Error, 'No auth found')
    })

    it('should fall back to netrc when an account is not provided', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'getAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'getAuth')
      netrcStub.resolves({login: 'user@example.com', password: 'netrc-token'})

      const auth = await credentialManager.getAuth(undefined, 'api.heroku.com')

      expect(macosStub.notCalled).to.be.true
      expect(netrcStub.calledOnce).to.be.true
      expect(auth).to.deep.equal({account: 'user@example.com', token: 'netrc-token'})
    })

    it('should retrieve from credential store with custom service name', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'getAuth').returns('keychain-token')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'getAuth')

      const auth = await credentialManager.getAuth('user@example.com', 'api.heroku.com', 'custom-service')

      expect(auth).to.deep.equal({account: 'user@example.com', token: 'keychain-token'})
      expect(macosStub.args[0][1]).to.equal('custom-service')
      expect(netrcStub.notCalled).to.be.true
    })
  })

  describe('removeAuth', function () {
    it('should remove from both credential store and netrc', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'removeAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.removeAuth('user@example.com', ['api.heroku.com'])

      expect(macosStub.calledOnce).to.be.true
      expect(macosStub.firstCall.args[0]).to.equal('user@example.com')
      expect(macosStub.firstCall.args[1]).to.equal('heroku-cli')
      expect(netrcStub.calledOnce).to.be.true
      expect(netrcStub.firstCall.args).to.deep.equal([['api.heroku.com'], 'user@example.com', undefined])
    })

    it('should remove from both stores even when HEROKU_NETRC_WRITE is true', async function () {
      process.env.HEROKU_NETRC_WRITE = 'TRUE'
      const macosStub = sinon.stub(MacOSHandler.prototype, 'removeAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.removeAuth('user@example.com', ['api.heroku.com'])

      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledOnce).to.be.true
    })

    it('should continue to netrc if credential store fails', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'removeAuth').throws(new Error('Keychain error'))
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.removeAuth('user@example.com', ['api.heroku.com'])

      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledOnce).to.be.true
    })

    it('should remove from credential store once and netrc once for multiple hosts', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'removeAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.removeAuth('user@example.com', ['api.heroku.com', 'git.heroku.com'])

      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledOnce).to.be.true
      expect(netrcStub.firstCall.args).to.deep.equal([
        ['api.heroku.com', 'git.heroku.com'],
        'user@example.com',
        undefined,
      ])
    })

    it('should throw an error when netrc fails to remove', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'removeAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').throws(new Error('Netrc error'))

      await expect(credentialManager.removeAuth('user@example.com', ['api.heroku.com']))
        .to.be.rejectedWith(Error, 'Netrc error')
      expect(macosStub.calledOnce).to.be.true
      expect(netrcStub.calledOnce).to.be.true
    })

    it('should remove from credential store with custom service name', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'removeAuth')
      sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.removeAuth('user@example.com', ['api.heroku.com'], 'custom-service')

      expect(macosStub.args[0][1]).to.equal('custom-service')
    })

    it('should continue to netrc if account is undefined without native removal or warnings', async function () {
      const macosStub = sinon.stub(MacOSHandler.prototype, 'removeAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.removeAuth(undefined, ['api.heroku.com'])

      expect(macosStub.notCalled).to.be.true
      expect(netrcStub.calledOnce).to.be.true
      expect(netrcStub.firstCall.args).to.deep.equal([['api.heroku.com'], undefined, undefined])
    })

    it('should preserve a newer native token when expected token differs', async function () {
      const getStub = sinon.stub(MacOSHandler.prototype, 'getAuth').returns('newer-token')
      const removeStub = sinon.stub(MacOSHandler.prototype, 'removeAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.removeAuth('user@example.com', ['api.heroku.com'], 'heroku-cli', 'older-token')

      expect(getStub.calledOnceWith('user@example.com', 'heroku-cli')).to.be.true
      expect(removeStub.notCalled).to.be.true
      expect(netrcStub.calledOnceWith(['api.heroku.com'], 'user@example.com', 'older-token')).to.be.true
    })

    it('should remove a native token matching the expected token', async function () {
      const getStub = sinon.stub(MacOSHandler.prototype, 'getAuth').returns('token')
      const removeStub = sinon.stub(MacOSHandler.prototype, 'removeAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.removeAuth('user@example.com', ['api.heroku.com'], 'custom-service', 'token')

      expect(getStub.calledOnceWith('user@example.com', 'custom-service')).to.be.true
      expect(removeStub.calledOnceWith('user@example.com', 'custom-service')).to.be.true
      expect(netrcStub.calledOnceWith(['api.heroku.com'], 'user@example.com', 'token')).to.be.true
    })

    it('should treat a missing expected native token as an idempotent removal', async function () {
      sinon.stub(MacOSHandler.prototype, 'getAuth').throws(new NativeCredentialNotFoundError('Not found'))
      const removeStub = sinon.stub(MacOSHandler.prototype, 'removeAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.removeAuth('user@example.com', ['api.heroku.com'], 'heroku-cli', 'token')

      expect(removeStub.notCalled).to.be.true
      expect(netrcStub.calledOnceWith(['api.heroku.com'], 'user@example.com', 'token')).to.be.true
    })

    it('should continue netrc cleanup when an expected native token read fails', async function () {
      sinon.stub(MacOSHandler.prototype, 'getAuth').throws(new Error('Keychain error'))
      const removeStub = sinon.stub(MacOSHandler.prototype, 'removeAuth')
      const netrcStub = sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.removeAuth('user@example.com', ['api.heroku.com'], 'heroku-cli', 'token')

      expect(removeStub.notCalled).to.be.true
      expect(netrcStub.calledOnceWith(['api.heroku.com'], 'user@example.com', 'token')).to.be.true
    })

    it('should not read native storage before unconditional removal', async function () {
      const getStub = sinon.stub(MacOSHandler.prototype, 'getAuth').throws(new Error('Keychain read error'))
      const removeStub = sinon.stub(MacOSHandler.prototype, 'removeAuth')
      sinon.stub(NetrcHandler.prototype, 'removeAuthForHosts').resolves()

      await credentialManager.removeAuth('user@example.com', ['api.heroku.com'])

      expect(getStub.notCalled).to.be.true
      expect(removeStub.calledOnceWith('user@example.com', 'heroku-cli')).to.be.true
    })
  })

  describe('listKeychainAccounts', function () {
    it('should return accounts from the native credential store', async function () {
      sinon.stub(MacOSHandler.prototype, 'listAccounts').returns(['user1@example.com', 'user2@example.com'])

      const accounts = await credentialManager.listKeychainAccounts()

      expect(accounts).to.deep.equal(['user1@example.com', 'user2@example.com'])
    })

    it('should pass a custom service name to the handler', async function () {
      const listStub = sinon.stub(MacOSHandler.prototype, 'listAccounts').returns(['user@example.com'])

      await credentialManager.listKeychainAccounts('custom-service')

      expect(listStub.calledOnceWith('custom-service')).to.be.true
    })

    it('should return an empty array when no native credential store is available', async function () {
      process.env.HEROKU_NETRC_WRITE = 'TRUE'

      const accounts = await credentialManager.listKeychainAccounts()

      expect(accounts).to.deep.equal([])
    })

    it('should return an empty array when native account enumeration fails', async function () {
      sinon.stub(MacOSHandler.prototype, 'listAccounts').throws(new Error('Keychain error'))

      const accounts = await credentialManager.listKeychainAccounts()

      expect(accounts).to.deep.equal([])
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

  it('exports NativeCredentialNotFoundError from the package root', function () {
    const error = new credentialManager.NativeCredentialNotFoundError('Token not found')

    expect(error).to.be.instanceOf(Error)
    expect(error.name).to.equal('NativeCredentialNotFoundError')
    expect(error.message).to.equal('Token not found')
  })
})
