import {expect} from 'chai'
import childProcess from 'node:child_process'
import sinon from 'sinon'

import {LinuxHandler} from '../../src/credential-handlers/linux-handler.js'

describe('LinuxHandler', function () {
  let execSyncStub: sinon.SinonStub
  let spawnSyncStub: sinon.SinonStub
  let handler: LinuxHandler

  beforeEach(function () {
    execSyncStub = sinon.stub(childProcess, 'execSync')
    spawnSyncStub = sinon.stub(childProcess, 'spawnSync')
    handler = new LinuxHandler()
  })

  afterEach(function () {
    execSyncStub.restore()
    spawnSyncStub.restore()
  })

  describe('getAuth', function () {
    it('should call execSync with the correct arguments to retrieve the token', function () {
      execSyncStub.returns(Buffer.from('my-secret-token'))
      const token = handler.getAuth('test@example.com')
      expect(execSyncStub.args[0][0]).to.contain('secret-tool lookup service "heroku-cli" account "test@example.com"')
      expect(token).to.equal('my-secret-token')
    })

    it('should use custom service name when provided', function () {
      execSyncStub.returns(Buffer.from('my-secret-token'))
      const token = handler.getAuth('test@example.com', 'custom-service')
      expect(execSyncStub.args[0][0]).to.contain('secret-tool lookup service "custom-service" account "test@example.com"')
      expect(token).to.equal('my-secret-token')
    })

    it('should throw an error when token is empty', function () {
      execSyncStub.returns(Buffer.from(''))
      expect(() => handler.getAuth('test@example.com')).to.throw('Failed to retrieve token from Linux keyring: Token not found')
    })

    it('should throw an error when retrieval fails and scrub sensitive data from error message', function () {
      const err = new Error(
        'Command failed: secret-tool lookup service "heroku-cli" account "test@example.com"',
      )
      execSyncStub.throws(err)

      try {
        handler.getAuth('test@example.com')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Failed to retrieve token from Linux keyring')
        expect((error as Error).message).to.include('[SCRUBBED]')
        expect((error as Error).message).to.not.include('test@example.com')
      }
    })
  })

  describe('removeAuth', function () {
    it('should call execSync with the correct arguments to remove the token', function () {
      execSyncStub.returns(Buffer.from(''))
      handler.removeAuth('test@example.com')
      expect(execSyncStub.args[0][0]).to.contain('secret-tool clear service "heroku-cli" account "test@example.com"')
    })

    it('should use custom service name when provided', function () {
      execSyncStub.returns(Buffer.from(''))
      handler.removeAuth('test@example.com', 'custom-service')
      expect(execSyncStub.args[0][0]).to.contain('secret-tool clear service "custom-service" account "test@example.com"')
    })

    it('should throw an error when removal fails and scrub sensitive data from error message', function () {
      const err = new Error(
        'Command failed: secret-tool clear service "heroku-cli" account "user@example.com"',
      )
      execSyncStub.throws(err)

      try {
        handler.removeAuth('user@example.com')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Failed to remove token from Linux keyring')
        expect((error as Error).message).to.include('[SCRUBBED]')
        expect((error as Error).message).to.not.include('user@example.com')
      }
    })
  })

  describe('saveAuth', function () {
    it('should call spawnSync with the correct arguments to save/update the token', function () {
      spawnSyncStub.returns({
        error: undefined,
        status: 0,
        stderr: Buffer.from(''),
      })
      const authMock = {
        account: 'test@example.com',
        service: 'heroku-cli',
        token: 'mytoken',
      }
      handler.saveAuth(authMock)

      expect(spawnSyncStub.calledOnce).to.be.true
      expect(spawnSyncStub.args[0][0]).to.equal('secret-tool')
      expect(spawnSyncStub.args[0][1]).to.deep.equal([
        'store',
        '--label=Heroku CLI',
        'service',
        'heroku-cli',
        'account',
        'test@example.com',
      ])
      expect(spawnSyncStub.args[0][2].input).to.equal('mytoken')
    })

    it('should throw an error when save command fails', function () {
      const authMock = {
        account: 'test@example.com',
        service: 'heroku-cli',
        token: 'mytoken',
      }

      spawnSyncStub.returns({
        error: undefined,
        status: 1,
        stderr: Buffer.from('error communicating with Secret Service'),
      })

      try {
        handler.saveAuth(authMock)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Failed to store token in Linux keyring: error communicating with Secret Service')
      }
    })

    it('should throw an error when spawnSync encounters a system error', function () {
      const authMock = {
        account: 'test@example.com',
        service: 'heroku-cli',
        token: 'mytoken',
      }

      spawnSyncStub.returns({
        error: new Error('ENOENT: secret-tool command not found'),
        status: null,
        stderr: Buffer.from(''),
      })

      try {
        handler.saveAuth(authMock)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Failed to store token in Linux keyring: ENOENT: secret-tool command not found')
      }
    })

    it('should use fallback error message when stderr is empty', function () {
      const authMock = {
        account: 'test@example.com',
        service: 'heroku-cli',
        token: 'mytoken',
      }

      spawnSyncStub.returns({
        error: undefined,
        status: 1,
        stderr: Buffer.from(''),  // Empty stderr triggers fallback
      })

      try {
        handler.saveAuth(authMock)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Failed to store token in Linux keyring: Unknown error')
      }
    })
  })
})
