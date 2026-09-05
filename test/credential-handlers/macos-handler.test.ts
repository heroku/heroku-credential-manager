import {expect} from 'chai'
import childProcess from 'node:child_process'
import sinon from 'sinon'

import {MacOSHandler} from '../../src/credential-handlers/macos-handler.js'

describe('MacOSHandler', function () {
  let execSyncStub: sinon.SinonStub
  let spawnSyncStub: sinon.SinonStub
  let handler: MacOSHandler

  beforeEach(function () {
    execSyncStub = sinon.stub(childProcess, 'execSync')
    spawnSyncStub = sinon.stub(childProcess, 'spawnSync')
    handler = new MacOSHandler()
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
        'security',
        ['find-generic-password', '-a', account, '-s', service, '-w'],
        {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
      )).to.be.true
    })

    it('should call spawnSync with the correct arguments to retrieve the token', function () {
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: 'my-secret-token',
      })
      const token = handler.getAuth('test@example.com', 'heroku-cli')
      expect(spawnSyncStub.calledOnceWithExactly(
        'security',
        ['find-generic-password', '-a', 'test@example.com', '-s', 'heroku-cli', '-w'],
        {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
      )).to.be.true
      expect(token).to.equal('my-secret-token')
    })

    it('should throw an error when token is empty', function () {
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: '',
      })
      expect(() => handler.getAuth('test@example.com', 'heroku-cli')).to.throw('Failed to retrieve token from macOS Keychain: Token not found')
    })

    it('should throw an error when retrieval fails', function () {
      spawnSyncStub.returns({
        error: undefined, status: 1, stderr: 'Permission denied', stdout: '',
      })
      expect(() => handler.getAuth('test@example.com', 'heroku-cli')).to.throw('Failed to retrieve token from macOS Keychain: Permission denied')
    })

    it('should throw an error when spawnSync encounters a system error', function () {
      spawnSyncStub.returns({
        error: new Error('ENOENT: security command not found'), status: null, stderr: '', stdout: '',
      })
      expect(() => handler.getAuth('test@example.com', 'heroku-cli')).to.throw('Failed to retrieve token from macOS Keychain: ENOENT: security command not found')
    })

    it('should scrub sensitive data from retrieval diagnostics', function () {
      const account = 'test@example.com'
      const service = 'heroku-cli-secret-service'
      spawnSyncStub.returns({
        error: undefined,
        status: 1,
        stderr: `security: account ${account}; service ${service}`,
        stdout: '',
      })

      try {
        handler.getAuth(account, service)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Failed to retrieve token from macOS Keychain')
        expect((error as Error).message).to.include('[SCRUBBED]')
        expect((error as Error).message).to.not.include(account)
        expect((error as Error).message).to.not.include(service)
      }
    })
  })

  describe('listAccounts', function () {
    it('should call spawnSync with the correct arguments to list accounts', function () {
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: '',
      })
      handler.listAccounts('heroku-cli')

      expect(execSyncStub.called).to.be.false
      expect(spawnSyncStub.calledOnceWithExactly(
        'security',
        ['dump-keychain'],
        {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
      )).to.be.true
    })

    it('should return an array of accounts when multiple credentials are found', function () {
      const mockOutput = `
keychain: "/Users/test/Library/Keychains/login.keychain-db"
version: 512
class: "genp"
attributes:
    0x00000007 <blob>="heroku-cli"
    "acct"<blob>="user1@example.com"
    "svce"<blob>="heroku-cli"
keychain: "/Users/test/Library/Keychains/login.keychain-db"
version: 512
class: "genp"
attributes:
    0x00000007 <blob>="heroku-cli"
    "acct"<blob>="user2@example.com"
    "svce"<blob>="heroku-cli"
`
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: mockOutput,
      })
      const accounts = handler.listAccounts('heroku-cli')

      expect(accounts).to.deep.equal(['user1@example.com', 'user2@example.com'])
    })

    it('should filter by service name when multiple services exist', function () {
      const mockOutput = `
keychain: "/Users/test/Library/Keychains/login.keychain-db"
version: 512
class: "genp"
attributes:
    "acct"<blob>="test@example.com"
    "svce"<blob>="heroku-cli"
keychain: "/Users/test/Library/Keychains/login.keychain-db"
version: 512
class: "genp"
attributes:
    "acct"<blob>="wrong@example.com"
    "svce"<blob>="other-service"
`
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: mockOutput,
      })
      const accounts = handler.listAccounts('heroku-cli')

      expect(accounts).to.deep.equal(['test@example.com'])
    })

    it('should only process generic password entries', function () {
      const mockOutput = `
keychain: "/Users/test/Library/Keychains/login.keychain-db"
version: 512
class: "cer"
attributes:
    "acct"<blob>="test1@example.com"
    "svce"<blob>=""
keychain: "/Users/test/Library/Keychains/login.keychain-db"
version: 512
class: "genp"
attributes:
    "acct"<blob>="test2@example.com"
    "svce"<blob>="heroku-cli"
`
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: mockOutput,
      })
      const accounts = handler.listAccounts('heroku-cli')

      expect(accounts).to.deep.equal(['test2@example.com'])
    })

    it('should return a single account when only one credential is found', function () {
      const mockOutput = `
keychain: "/Users/test/Library/Keychains/login.keychain-db"
version: 512
class: "genp"
attributes:
    0x00000007 <blob>="heroku-cli"
    "acct"<blob>="test@example.com"
    "svce"<blob>="heroku-cli"
`
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: mockOutput,
      })
      const accounts = handler.listAccounts('heroku-cli')

      expect(accounts).to.deep.equal(['test@example.com'])
    })

    it('should return an empty array when no credentials are found', function () {
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: '',
      })
      const accounts = handler.listAccounts('heroku-cli')

      expect(accounts).to.deep.equal([])
    })

    it('should throw an error when the search command fails', function () {
      spawnSyncStub.returns({
        error: undefined, status: 1, stderr: 'Permission denied', stdout: '',
      })
      expect(() => handler.listAccounts('heroku-cli')).to.throw('Failed to list accounts in macOS Keychain: Permission denied')
    })
  })

  describe('removeAuth', function () {
    it('should call spawnSync with the correct arguments to remove the token', function () {
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: '',
      })
      handler.removeAuth('test@example.com', 'heroku-cli')
      expect(spawnSyncStub.calledOnceWithExactly(
        'security',
        ['delete-generic-password', '-a', 'test@example.com', '-s', 'heroku-cli'],
        {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
      )).to.be.true
    })

    it('should throw an error when removal fails', function () {
      spawnSyncStub.returns({
        error: undefined, status: 1, stderr: 'Permission denied', stdout: '',
      })
      expect(() => handler.removeAuth('test@example.com', 'heroku-cli')).to.throw('Failed to remove token from macOS Keychain: Permission denied')
    })

    it('should return when the generic password does not exist (exit 44)', function () {
      spawnSyncStub.returns({
        error: undefined, status: 44, stderr: 'The specified item could not be found.', stdout: '',
      })
      expect(() => handler.removeAuth('missing@example.com', 'heroku-cli')).to.not.throw()
    })

    it('should throw an error when spawnSync encounters a system error', function () {
      spawnSyncStub.returns({
        error: new Error('ENOENT: security command not found'), status: null, stderr: '', stdout: '',
      })
      expect(() => handler.removeAuth('test@example.com', 'heroku-cli')).to.throw('Failed to remove token from macOS Keychain: ENOENT: security command not found')
    })

    it('should pass adversarial account and service values as exact arguments without a shell', function () {
      const account = 'user"; $(touch /tmp/pwned); `id`; $env:Path'
      const service = 'service\'; rm -rf /; $(whoami); Write-Host "owned"'
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: '',
      })

      handler.removeAuth(account, service)
      expect(execSyncStub.called).to.be.false
      expect(spawnSyncStub.calledOnceWithExactly(
        'security',
        ['delete-generic-password', '-a', account, '-s', service],
        {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
      )).to.be.true
    })

    it('should scrub sensitive data from removal diagnostics', function () {
      const account = 'user@example.com'
      const service = 'heroku-cli-secret-service'
      spawnSyncStub.returns({
        error: undefined,
        status: 1,
        stderr: `security: account ${account}; service ${service}`,
        stdout: '',
      })

      try {
        handler.removeAuth(account, service)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Failed to remove token from macOS Keychain')
        expect((error as Error).message).to.include('[SCRUBBED]')
        expect((error as Error).message).to.not.include(account)
        expect((error as Error).message).to.not.include(service)
      }
    })
  })

  describe('saveAuth', function () {
    it('should pass exact arguments to save/update the token without a shell', function () {
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: '',
      })
      const authMock = {
        account: 'test@example.com',
        service: 'heroku-cli',
        token: 'mytoken',
      }
      handler.saveAuth(authMock)
      expect(spawnSyncStub.calledOnceWithExactly(
        'security',
        ['add-generic-password', '-U', '-a', 'test@example.com', '-s', 'heroku-cli', '-w', 'mytoken'],
        {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
      )).to.be.true
    })

    it('should throw an error when add command fails', function () {
      spawnSyncStub.returns({
        error: undefined, status: 1, stderr: 'Permission denied', stdout: '',
      })

      const authMock = {
        account: 'test@example.com',
        service: 'heroku-cli',
        token: 'mytoken',
      }

      expect(() => handler.saveAuth(authMock)).to.throw('Failed to store token in macOS Keychain: Permission denied')
    })

    it('should throw an error when spawnSync encounters a system error', function () {
      spawnSyncStub.returns({
        error: new Error('ENOENT: security command not found'), status: null, stderr: '', stdout: '',
      })
      expect(() => handler.saveAuth({account: 'test@example.com', service: 'heroku-cli', token: 'mytoken'})).to.throw('Failed to store token in macOS Keychain: ENOENT: security command not found')
    })

    it('should pass adversarial values as exact arguments without a shell', function () {
      const account = 'user"; $(touch /tmp/pwned); `id`; $env:Path'
      const service = 'service\'; rm -rf /; $(whoami); Write-Host "owned"'
      const token = 'token"; $(curl attacker); `whoami`; $env:USER'
      spawnSyncStub.returns({
        error: undefined, status: 0, stderr: '', stdout: '',
      })

      handler.saveAuth({account, service, token})
      expect(execSyncStub.called).to.be.false
      expect(spawnSyncStub.calledOnceWithExactly(
        'security',
        ['add-generic-password', '-U', '-a', account, '-s', service, '-w', token],
        {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
      )).to.be.true
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
        stderr: `security: account ${authMock.account}; service ${authMock.service}; password ${authMock.token}`,
        stdout: '',
      })

      try {
        handler.saveAuth(authMock)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.include('Failed to store token in macOS Keychain')
        expect((error as Error).message).to.include('[SCRUBBED]')
        expect((error as Error).message).to.not.include(authMock.account)
        expect((error as Error).message).to.not.include(authMock.service)
        expect((error as Error).message).to.not.include(authMock.token)
      }
    })
  })

  describe('input validation', function () {
    const cases: Array<{expected: string; invoke: (subject: MacOSHandler) => unknown; name: string}> = [
      {expected: 'Failed to retrieve token from macOS Keychain: Account must not contain NUL characters', invoke: subject => subject.getAuth('bad\0account', 'Account'), name: 'getAuth account'},
      {expected: 'Failed to retrieve token from macOS Keychain: Service must not contain NUL characters', invoke: subject => subject.getAuth('account', 'bad\0service'), name: 'getAuth service'},
      {expected: 'Failed to list accounts in macOS Keychain: Service must not contain NUL characters', invoke: subject => subject.listAccounts('bad\0service'), name: 'listAccounts service'},
      {expected: 'Failed to remove token from macOS Keychain: Account must not contain NUL characters', invoke: subject => subject.removeAuth('bad\0account', 'service'), name: 'removeAuth account'},
      {expected: 'Failed to remove token from macOS Keychain: Service must not contain NUL characters', invoke: subject => subject.removeAuth('account', 'bad\0service'), name: 'removeAuth service'},
      {expected: 'Failed to store token in macOS Keychain: Account must not contain NUL characters', invoke: subject => subject.saveAuth({account: 'bad\0account', service: 'service', token: 'token'}), name: 'saveAuth account'},
      {expected: 'Failed to store token in macOS Keychain: Service must not contain NUL characters', invoke: subject => subject.saveAuth({account: 'account', service: 'bad\0service', token: 'token'}), name: 'saveAuth service'},
      {expected: 'Failed to store token in macOS Keychain: Token must not contain NUL characters', invoke: subject => subject.saveAuth({account: 'account', service: 'service', token: 'bad\0token'}), name: 'saveAuth token'},
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
      spawnSyncStub.returns({
        error: undefined, status: 2, stderr: diagnostic, stdout: '',
      })
      expectDiagnosticScrubbed(() => handler.listAccounts(secret), variants)
    })

    it('should scrub raw, UTF-8 base64, and normalized remove diagnostics', function () {
      const {diagnostic, secret, variants} = diagnosticVariants()
      spawnSyncStub.returns({
        error: undefined, status: 2, stderr: diagnostic, stdout: '',
      })
      expectDiagnosticScrubbed(() => handler.removeAuth(secret, 'service'), variants)
    })

    it('should scrub raw, UTF-8 base64, and normalized save diagnostics', function () {
      const {diagnostic, secret, variants} = diagnosticVariants()
      spawnSyncStub.returns({
        error: undefined, status: 2, stderr: diagnostic, stdout: '',
      })
      expectDiagnosticScrubbed(() => handler.saveAuth({account: 'account', service: 'service', token: secret}), variants)
    })
  })

  describe('process signals', function () {
    const operations: Array<{invoke: (subject: MacOSHandler) => unknown; name: string; prefix: string}> = [
      {invoke: subject => subject.getAuth('account', 'service'), name: 'getAuth', prefix: 'Failed to retrieve token from macOS Keychain'},
      {invoke: subject => subject.listAccounts('service'), name: 'listAccounts', prefix: 'Failed to list accounts in macOS Keychain'},
      {invoke: subject => subject.removeAuth('account', 'service'), name: 'removeAuth', prefix: 'Failed to remove token from macOS Keychain'},
      {invoke: subject => subject.saveAuth({account: 'account', service: 'service', token: 'token'}), name: 'saveAuth', prefix: 'Failed to store token in macOS Keychain'},
    ]

    for (const operation of operations) {
      it(`prioritizes a process error over a signal for ${operation.name}`, function () {
        spawnSyncStub.returns({
          error: new Error('spawn security EACCES'), signal: 'SIGTERM', status: null, stderr: 'misleading diagnostic', stdout: '',
        })

        expect(() => operation.invoke(handler)).to.throw(`${operation.prefix}: spawn security EACCES`)
      })

      it(`prioritizes a signal over status and stderr for ${operation.name}`, function () {
        spawnSyncStub.returns({
          error: undefined, signal: 'SIGTERM', status: 44, stderr: 'misleading diagnostic', stdout: '',
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
