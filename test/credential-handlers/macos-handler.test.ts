import {expect} from 'chai'
import childProcess from 'node:child_process'
import sinon from 'sinon'

import {MacOSHandler} from '../../src/credential-handlers/macos-handler.js'

describe('MacOSHandler', function () {
  let execSyncStub: sinon.SinonStub
  let handler: MacOSHandler

  beforeEach(function () {
    execSyncStub = sinon.stub(childProcess, 'execSync')
    handler = new MacOSHandler()
  })

  afterEach(function () {
    execSyncStub.restore()
  })

  describe('getAuth', function () {
    it('should call execSync with the correct arguments to retrieve the token', function () {
      execSyncStub.returns(Buffer.from('my-secret-token'))
      const token = handler.getAuth('test@example.com')
      expect(execSyncStub.args[0][0]).to.contain('find-generic-password -a "test@example.com" -s "heroku-cli"')
      expect(token).to.equal('my-secret-token')
    })

    it('should use custom service name when provided', function () {
      execSyncStub.returns(Buffer.from('my-secret-token'))
      const token = handler.getAuth('test@example.com', 'custom-service')
      expect(execSyncStub.args[0][0]).to.contain('find-generic-password -a "test@example.com" -s "custom-service"')
      expect(token).to.equal('my-secret-token')
    })

    it('should throw an error when token is empty', function () {
      execSyncStub.returns(Buffer.from(''))
      expect(() => handler.getAuth('test@example.com')).to.throw('Failed to retrieve token from macOS Keychain: Token not found')
    })

    it('should throw an error when retrieval fails', function () {
      const err = new Error(
        'Command failed: security find-generic-password -a "test@example.com" -s "heroku-cli" -w',
      )
      execSyncStub.throws(err)

      try {
        handler.getAuth('test@example.com')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Failed to retrieve token from macOS Keychain')
        expect((error as Error).message).to.include('[SCRUBBED]')
        expect((error as Error).message).to.not.include('test@example.com')
      }
    })
  })

  describe('removeAuth', function () {
    it('should call execSync with the correct arguments to remove the token', function () {
      execSyncStub.returns(Buffer.from(''))
      handler.removeAuth('test@example.com')
      expect(execSyncStub.args[0][0]).to.contain('delete-generic-password -a "test@example.com" -s "heroku-cli"')
    })

    it('should use custom service name when provided', function () {
      execSyncStub.returns(Buffer.from(''))
      handler.removeAuth('test@example.com', 'custom-service')
      expect(execSyncStub.args[0][0]).to.contain('delete-generic-password -a "test@example.com" -s "custom-service"')
    })

    it('should throw an error when removal fails', function () {
      const err = new Error(
        'Command failed: security delete-generic-password -a "user@example.com" -s "heroku-cli"',
      )
      execSyncStub.throws(err)

      try {
        handler.removeAuth('user@example.com')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Failed to remove token from macOS Keychain')
        expect((error as Error).message).to.include('[SCRUBBED]')
        expect((error as Error).message).to.not.include('user@example.com')
      }
    })
  })

  describe('saveAuth', function () {
    it('should call execSync with the correct arguments to save/update the token', function () {
      execSyncStub.returns(Buffer.from(''))
      const authMock = {
        account: 'test@example.com',
        service: 'heroku-cli',
        token: 'mytoken',
      }
      handler.saveAuth(authMock)
      expect(execSyncStub.args[0][0]).to.contain('add-generic-password -U -a "test@example.com" -s "heroku-cli" -w "mytoken"')
    })

    it('should throw an error when add command fails', function () {
      const authMock = {
        account: 'test@example.com',
        service: 'heroku-cli',
        token: 'mytoken',
      }

      const err = new Error(
        `Command failed: security add-generic-password -U -a "${authMock.account}" -s "${authMock.service}" -w "${authMock.token}"`,
      )
      execSyncStub.throws(err)

      try {
        handler.saveAuth(authMock)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Failed to store token in macOS Keychain')
        expect((error as Error).message).to.include('[SCRUBBED]')
        expect((error as Error).message).to.not.include('test@example.com')
        expect((error as Error).message).to.not.include('mytoken')
      }
    })
  })
})
