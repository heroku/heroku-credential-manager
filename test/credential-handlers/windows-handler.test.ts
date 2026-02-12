import chai, {expect} from 'chai'
import chaiAsPromised from 'chai-as-promised'
import childProcess from 'node:child_process'
import sinon from 'sinon'

import {WindowsHandler} from '../../src/credential-handlers/windows-handler.js'

chai.use(chaiAsPromised)

describe('WindowsHandler', function () {
  let execSyncStub: sinon.SinonStub
  let handler: WindowsHandler

  beforeEach(function () {
    execSyncStub = sinon.stub(childProcess, 'execSync')
    handler = new WindowsHandler()
  })

  afterEach(function () {
    execSyncStub.restore()
  })

  describe('getAuth', function () {
    it('should call execSync with the correct arguments to retrieve the token for the specified service and account', async function () {
      execSyncStub.returns(Buffer.from('my-secret-token'))
      const token = await handler.getAuth('test@example.com')
      expect(execSyncStub.args[0][0]).to.contain('Retrieve("heroku-cli", "test@example.com")')
      expect(token).to.equal('my-secret-token')
    })

    it('should use custom service name when provided', async function () {
      execSyncStub.returns(Buffer.from('my-secret-token'))
      const token = await handler.getAuth('test@example.com', 'custom-service')
      expect(execSyncStub.args[0][0]).to.contain('Retrieve("custom-service", "test@example.com")')
      expect(token).to.equal('my-secret-token')
    })

    it('should throw an error when token is empty', async function () {
      execSyncStub.returns(Buffer.from(''))
      await expect(handler.getAuth('test@example.com')).to.be.rejectedWith('Failed to retrieve token from Windows Credential Manager: Token not found')
    })
  })

  describe('removeAuth', function () {
    it('should call execSync with the correct arguments to remove the token for the specified service and account', async function () {
      execSyncStub.returns(Buffer.from(''))
      await handler.removeAuth('test@example.com')
      expect(execSyncStub.args[0][0]).to.contain('Retrieve("heroku-cli", "test@example.com")')
      expect(execSyncStub.args[0][0]).to.contain('vault.Remove')
    })

    it('should use custom service name when provided', async function () {
      execSyncStub.returns(Buffer.from(''))
      await handler.removeAuth('test@example.com', 'custom-service')
      expect(execSyncStub.args[0][0]).to.contain('Retrieve("custom-service", "test@example.com")')
      expect(execSyncStub.args[0][0]).to.contain('vault.Remove')
    })

    it('should throw an error when removal fails', async function () {
      execSyncStub.throws(new Error('Credential not found'))
      await expect(handler.removeAuth('test@example.com')).to.be.rejectedWith('Failed to remove token from Windows Credential Manager: Credential not found')
    })
  })

  describe('saveAuth', function () {
    it('should call execSync with the correct arguments to save the token for the specified service and account', async function () {
      execSyncStub.returns(Buffer.from(''))
      const authMock = {
        account: 'test@example.com',
        service: 'heroku-cli',
        token: 'mytoken',
      }
      await handler.saveAuth(authMock)
      expect(execSyncStub.args[0][0]).to.contain('Retrieve("heroku-cli", "test@example.com")')
      expect(execSyncStub.args[0][0]).to.contain('vault.Remove')
      expect(execSyncStub.args[1][0]).to.contain('New-Object Windows.Security.Credentials.PasswordCredential("heroku-cli", "test@example.com", "mytoken")')
      expect(execSyncStub.args[1][0]).to.contain('vault.Add')
    })

    it('should throw an error when add command fails', async function () {
      execSyncStub.onFirstCall().returns(Buffer.from(''))
      execSyncStub.onSecondCall().throws(new Error('Access denied'))
      const authMock = {
        account: 'test@example.com',
        service: 'heroku-cli',
        token: 'mytoken',
      }
      await expect(handler.saveAuth(authMock)).to.be.rejectedWith('Failed to store token in Windows Credential Manager: Access denied')
    })

    it('should continue to add credential when remove fails because item does not exist', async function () {
      execSyncStub.onFirstCall().throws(new Error('Element not found'))
      execSyncStub.onSecondCall().returns(Buffer.from(''))
      const authMock = {
        account: 'test@example.com',
        service: 'heroku-cli',
        token: 'mytoken',
      }
      await handler.saveAuth(authMock)
      expect(execSyncStub.calledTwice).to.be.true
      expect(execSyncStub.args[1][0]).to.contain('vault.Add')
    })
  })
})
