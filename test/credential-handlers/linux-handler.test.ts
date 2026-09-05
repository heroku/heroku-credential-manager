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
    it('should pass adversarial account and service values as exact arguments without a shell', function () {
      const account = 'user"; $(touch /tmp/pwned); `id`; $env:Path'
      const service = 'service\'; rm -rf /; $(whoami); Write-Host "owned"'
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: 'my-secret-token',
      })

      expect(handler.getAuth(account, service)).to.equal('my-secret-token')
      expect(execSyncStub.called).to.be.false
      expect(spawnSyncStub.calledOnceWithExactly(
        'secret-tool',
        ['lookup', '--', 'service', service, 'account', account],
        {encoding: 'utf8'},
      )).to.be.true
    })

    it('should call spawnSync with the correct arguments to retrieve the token', function () {
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: 'my-secret-token',
      })
      const token = handler.getAuth('test@example.com', 'heroku-cli')
      expect(spawnSyncStub.calledOnceWithExactly(
        'secret-tool',
        ['lookup', '--', 'service', 'heroku-cli', 'account', 'test@example.com'],
        {encoding: 'utf8'},
      )).to.be.true
      expect(token).to.equal('my-secret-token')
    })

    it('should throw an error when token is empty', function () {
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: '',
      })
      expect(() => handler.getAuth('test@example.com', 'heroku-cli')).to.throw('Failed to retrieve token from Linux keyring: Token not found')
    })

    it('should throw an error when retrieval fails', function () {
      spawnSyncStub.returns({
        error: undefined, status: 1, stderr: 'Permission denied', stdout: '',
      })
      expect(() => handler.getAuth('test@example.com', 'heroku-cli')).to.throw('Failed to retrieve token from Linux keyring: Permission denied')
    })

    it('should throw an error when spawnSync encounters a system error', function () {
      spawnSyncStub.returns({
        error: new Error('ENOENT: secret-tool command not found'), status: null, stderr: '', stdout: '',
      })
      expect(() => handler.getAuth('test@example.com', 'heroku-cli')).to.throw('Failed to retrieve token from Linux keyring: ENOENT: secret-tool command not found')
    })

    it('should scrub account and service from retrieval diagnostics', function () {
      const account = 'test@example.com'
      const service = 'heroku-cli-secret-service'
      spawnSyncStub.returns({
        error: undefined,
        status: 1,
        stderr: `secret-tool: service ${service}; account ${account}`,
        stdout: '',
      })

      try {
        handler.getAuth(account, service)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Failed to retrieve token from Linux keyring')
        expect((error as Error).message).to.include('[SCRUBBED]')
        expect((error as Error).message).to.not.include(account)
        expect((error as Error).message).to.not.include(service)
      }
    })

    it('should place the option terminator before leading-dash attribute values', function () {
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: 'token',
      })

      handler.getAuth('--account', '--service')

      expect(spawnSyncStub.args[0][1]).to.deep.equal(['lookup', '--', 'service', '--service', 'account', '--account'])
    })
  })

  describe('listAccounts', function () {
    it('should call spawnSync with the correct arguments to list accounts', function () {
      spawnSyncStub.returns({
        error: undefined,
        status: 0,
        stderr: '',
      })
      handler.listAccounts('heroku-cli')
      expect(spawnSyncStub.calledOnce).to.be.true
      expect(spawnSyncStub.args[0][0]).to.equal('secret-tool')
      expect(spawnSyncStub.args[0][1]).to.deep.equal(['search', '--all', '--', 'service', 'heroku-cli'])
    })

    it('should return an array of accounts when multiple credentials are found', function () {
      const mockStderr = `
attribute.account = user1@example.com
attribute.service = heroku-cli
attribute.account = user2@example.com
attribute.service = heroku-cli
`
      spawnSyncStub.returns({
        error: undefined,
        status: 0,
        stderr: mockStderr,
      })
      const accounts = handler.listAccounts('heroku-cli')

      expect(accounts).to.deep.equal(['user1@example.com', 'user2@example.com'])
    })

    it('should return a single account when only one credential is found', function () {
      const mockStderr = `
attribute.account = test@example.com
attribute.service = heroku-cli
`
      spawnSyncStub.returns({
        error: undefined,
        status: 0,
        stderr: mockStderr,
      })
      const accounts = handler.listAccounts('heroku-cli')

      expect(accounts).to.deep.equal(['test@example.com'])
    })

    it('should return an empty array when no credentials are found', function () {
      spawnSyncStub.returns({
        error: undefined,
        status: 0,
        stderr: '',
      })
      const accounts = handler.listAccounts('heroku-cli')

      expect(accounts).to.deep.equal([])
    })

    it('should throw an error when the search command fails', function () {
      spawnSyncStub.returns({
        error: undefined,
        status: 1,
        stderr: 'Permission denied',
      })
      expect(() => handler.listAccounts('heroku-cli')).to.throw('Failed to list accounts in Linux keyring: Permission denied')
    })

    it('should throw an error when spawnSync encounters a system error', function () {
      spawnSyncStub.returns({
        error: new Error('ENOENT: secret-tool command not found'),
        status: null,
        stderr: '',
      })
      expect(() => handler.listAccounts('heroku-cli')).to.throw('Failed to list accounts in Linux keyring: ENOENT: secret-tool command not found')
    })

    it('should place the option terminator before a leading-dash service value', function () {
      spawnSyncStub.returns({error: undefined, status: 0, stderr: ''})

      handler.listAccounts('--service')

      expect(spawnSyncStub.args[0][1]).to.deep.equal(['search', '--all', '--', 'service', '--service'])
    })
  })

  describe('removeAuth', function () {
    it('should call spawnSync with the correct arguments to remove the token', function () {
      spawnSyncStub.returns({
        error: undefined,
        status: 0,
        stderr: '',
      })
      handler.removeAuth('test@example.com', 'heroku-cli')
      expect(spawnSyncStub.calledOnce).to.be.true
      expect(spawnSyncStub.args[0][0]).to.equal('secret-tool')
      expect(spawnSyncStub.args[0][1]).to.deep.equal(['clear', '--', 'service', 'heroku-cli', 'account', 'test@example.com'])
    })

    it('should throw an error when removal fails', function () {
      spawnSyncStub.returns({
        error: undefined,
        status: 1,
        stderr: 'Permission denied',
      })
      expect(() => handler.removeAuth('test@example.com', 'heroku-cli')).to.throw('Failed to remove token from Linux keyring: Permission denied')
    })

    it('should throw when status 1 includes a missing-credential message', function () {
      spawnSyncStub.returns({
        error: undefined,
        status: 1,
        stderr: 'No matching credentials\n',
      })
      expect(() => handler.removeAuth('missing@example.com', 'heroku-cli')).to.throw('Failed to remove token from Linux keyring: No matching credentials')
    })

    it('should scrub sensitive data from error messages', function () {
      spawnSyncStub.returns({
        error: undefined,
        status: 1,
        stderr: 'secret-tool clear service "heroku-cli" account "user@example.com" failed',
      })

      try {
        handler.removeAuth('user@example.com', 'heroku-cli')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Failed to remove token from Linux keyring')
        expect((error as Error).message).to.include('[SCRUBBED]')
        expect((error as Error).message).to.not.include('user@example.com')
      }
    })

    it('should return when secret-tool exits 1 with empty stderr', function () {
      spawnSyncStub.returns({
        error: undefined,
        status: 1,
        stderr: '',
      })
      expect(() => handler.removeAuth('missing@example.com', 'heroku-cli')).to.not.throw()
    })

    it('should throw when secret-tool exits 1 with whitespace-only stderr', function () {
      spawnSyncStub.returns({
        error: undefined,
        status: 1,
        stderr: '  \n',
      })
      expect(() => handler.removeAuth('missing@example.com', 'heroku-cli')).to.throw('Failed to remove token from Linux keyring')
    })

    it('should throw when secret-tool exits with another empty-stderr status', function () {
      spawnSyncStub.returns({
        error: undefined,
        status: 2,
        stderr: '',
      })
      expect(() => handler.removeAuth('missing@example.com', 'heroku-cli')).to.throw('Failed to remove token from Linux keyring: exit 2')
    })

    it('should throw when secret-tool is terminated by a signal', function () {
      spawnSyncStub.returns({
        error: undefined,
        signal: 'SIGTERM',
        status: null,
        stderr: '',
      })
      expect(() => handler.removeAuth('missing@example.com', 'heroku-cli')).to.throw('Failed to remove token from Linux keyring: terminated by signal SIGTERM')
    })

    it('should pass LC_ALL=C in the environment', function () {
      spawnSyncStub.returns({
        error: undefined,
        status: 0,
        stderr: '',
      })
      handler.removeAuth('test@example.com', 'heroku-cli')
      const options = spawnSyncStub.args[0][2]
      expect(options.env.LC_ALL).to.equal('C')
    })

    it('should place the option terminator before leading-dash attribute values', function () {
      spawnSyncStub.returns({error: undefined, status: 0, stderr: ''})

      handler.removeAuth('--account', '--service')

      expect(spawnSyncStub.args[0][1]).to.deep.equal(['clear', '--', 'service', '--service', 'account', '--account'])
    })
  })

  describe('saveAuth', function () {
    it('should call spawnSync with the correct arguments to save/update the token', function () {
      spawnSyncStub.returns({
        error: undefined,
        status: 0,
        stderr: '',
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
        '--',
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
        stderr: 'error communicating with Secret Service',
      })
      expect(() => handler.saveAuth(authMock)).to.throw('Failed to store token in Linux keyring: error communicating with Secret Service')
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
        stderr: '',
      })
      expect(() => handler.saveAuth(authMock)).to.throw('Failed to store token in Linux keyring: ENOENT: secret-tool command not found')
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
        stderr: '', // Empty stderr triggers fallback
      })
      expect(() => handler.saveAuth(authMock)).to.throw('Failed to store token in Linux keyring: Unknown error')
    })

    it('should scrub account, service, and token from save diagnostics', function () {
      const authMock = {
        account: 'test@example.com',
        service: 'heroku-cli-secret-service',
        token: 'my-super-secret-token',
      }

      spawnSyncStub.returns({
        error: undefined,
        status: 1,
        stderr: `secret-tool: service ${authMock.service}; account ${authMock.account}; secret ${authMock.token}`,
      })

      try {
        handler.saveAuth(authMock)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Failed to store token in Linux keyring')
        expect((error as Error).message).to.include('[SCRUBBED]')
        expect((error as Error).message).to.not.include(authMock.account)
        expect((error as Error).message).to.not.include(authMock.service)
        expect((error as Error).message).to.not.include(authMock.token)
      }
    })

    it('should place the option terminator before leading-dash attribute values', function () {
      spawnSyncStub.returns({error: undefined, status: 0, stderr: ''})

      handler.saveAuth({account: '--account', service: '--service', token: '--token'})

      expect(spawnSyncStub.args[0][1]).to.deep.equal([
        'store', '--label=Heroku CLI', '--', 'service', '--service', 'account', '--account',
      ])
      expect(spawnSyncStub.args[0][2].input).to.equal('--token')
    })
  })

  describe('input validation', function () {
    const cases: Array<{expected: string; invoke: (subject: LinuxHandler) => unknown; name: string}> = [
      {expected: 'Failed to retrieve token from Linux keyring: Account must not contain NUL characters', invoke: subject => subject.getAuth('bad\0account', 'Account'), name: 'getAuth account'},
      {expected: 'Failed to retrieve token from Linux keyring: Service must not contain NUL characters', invoke: subject => subject.getAuth('account', 'bad\0service'), name: 'getAuth service'},
      {expected: 'Failed to list accounts in Linux keyring: Service must not contain NUL characters', invoke: subject => subject.listAccounts('bad\0service'), name: 'listAccounts service'},
      {expected: 'Failed to remove token from Linux keyring: Account must not contain NUL characters', invoke: subject => subject.removeAuth('bad\0account', 'service'), name: 'removeAuth account'},
      {expected: 'Failed to remove token from Linux keyring: Service must not contain NUL characters', invoke: subject => subject.removeAuth('account', 'bad\0service'), name: 'removeAuth service'},
      {expected: 'Failed to store token in Linux keyring: Account must not contain NUL characters', invoke: subject => subject.saveAuth({account: 'bad\0account', service: 'service', token: 'token'}), name: 'saveAuth account'},
      {expected: 'Failed to store token in Linux keyring: Service must not contain NUL characters', invoke: subject => subject.saveAuth({account: 'account', service: 'bad\0service', token: 'token'}), name: 'saveAuth service'},
      {expected: 'Failed to store token in Linux keyring: Token must not contain NUL characters', invoke: subject => subject.saveAuth({account: 'account', service: 'service', token: 'bad\0token'}), name: 'saveAuth token'},
    ]

    for (const testCase of cases) {
      it(`should reject NUL in ${testCase.name} before spawning`, function () {
        expect(() => testCase.invoke(handler)).to.throw(testCase.expected)
        expect(spawnSyncStub.called).to.be.false
      })
    }
  })

  describe('diagnostic scrubbing', function () {
    it('should scrub raw, UTF-8 base64, and normalized get diagnostics', function () {
      const {diagnostic, secret, variants} = diagnosticVariants()
      spawnSyncStub.returns({
        error: undefined, status: 2, stderr: diagnostic, stdout: '',
      })
      expectDiagnosticScrubbed(() => handler.getAuth(secret, 'service'), variants)
    })

    it('should scrub raw, UTF-8 base64, and normalized list diagnostics', function () {
      const {diagnostic, secret, variants} = diagnosticVariants()
      spawnSyncStub.returns({error: undefined, status: 2, stderr: diagnostic})
      expectDiagnosticScrubbed(() => handler.listAccounts(secret), variants)
    })

    it('should scrub raw, UTF-8 base64, and normalized remove diagnostics', function () {
      const {diagnostic, secret, variants} = diagnosticVariants()
      spawnSyncStub.returns({error: undefined, status: 2, stderr: diagnostic})
      expectDiagnosticScrubbed(() => handler.removeAuth(secret, 'service'), variants)
    })

    it('should scrub raw, UTF-8 base64, and normalized save diagnostics', function () {
      const {diagnostic, secret, variants} = diagnosticVariants()
      spawnSyncStub.returns({error: undefined, status: 2, stderr: diagnostic})
      expectDiagnosticScrubbed(() => handler.saveAuth({account: 'account', service: 'service', token: secret}), variants)
    })
  })

  describe('process signals', function () {
    const operations: Array<{invoke: (subject: LinuxHandler) => unknown; name: string; prefix: string}> = [
      {invoke: subject => subject.getAuth('account', 'service'), name: 'getAuth', prefix: 'Failed to retrieve token from Linux keyring'},
      {invoke: subject => subject.listAccounts('service'), name: 'listAccounts', prefix: 'Failed to list accounts in Linux keyring'},
      {invoke: subject => subject.removeAuth('account', 'service'), name: 'removeAuth', prefix: 'Failed to remove token from Linux keyring'},
      {invoke: subject => subject.saveAuth({account: 'account', service: 'service', token: 'token'}), name: 'saveAuth', prefix: 'Failed to store token in Linux keyring'},
    ]

    for (const operation of operations) {
      it(`prioritizes a process error over a signal for ${operation.name}`, function () {
        spawnSyncStub.returns({
          error: new Error('spawn secret-tool EACCES'), signal: 'SIGTERM', status: null, stderr: 'misleading diagnostic', stdout: '',
        })

        expect(() => operation.invoke(handler)).to.throw(`${operation.prefix}: spawn secret-tool EACCES`)
      })

      it(`prioritizes a signal over status and stderr for ${operation.name}`, function () {
        spawnSyncStub.returns({
          error: undefined, signal: 'SIGTERM', status: 1, stderr: 'misleading diagnostic', stdout: '',
        })

        expect(() => operation.invoke(handler)).to.throw(`${operation.prefix}: terminated by signal SIGTERM`)
      })
    }
  })
})

function diagnosticVariants(): {diagnostic: string; secret: string; variants: string[]} {
  const secret = 'päss\r\nsecond-line'
  const variants = [
    secret,
    secret.replaceAll('\r\n', '\n'),
    Buffer.from(secret, 'utf8').toString('base64'),
    Buffer.from(secret.replaceAll('\r\n', '\n'), 'utf8').toString('base64'),
  ]
  return {diagnostic: variants.join(' | '), secret, variants}
}

function expectDiagnosticScrubbed(invoke: () => unknown, variants: string[]): void {
  expect(invoke).to.throw()
  try {
    invoke()
  } catch (error) {
    for (const variant of variants) expect((error as Error).message).to.not.include(variant)
  }
}
