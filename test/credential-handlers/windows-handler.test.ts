import {expect} from 'chai'
import childProcess from 'node:child_process'
import fs from 'node:fs'
import sinon from 'sinon'

import {WindowsHandler} from '../../src/credential-handlers/windows-handler.js'

const encode = (value: string): string => Buffer.from(value, 'utf8').toString('base64')
const missingCredentialSentinel = 'HEROKU_CREDENTIAL_NOT_FOUND'
const variants = (value: string): string[] => {
  const lf = value.replaceAll('\r\n', '\n')
  return [value, lf, encode(value), encode(lf)]
}

function expectScrubbed(spawnSyncStub: sinon.SinonStub, call: () => unknown, secrets: string[]): void {
  const leakedValues = secrets.flatMap(value => variants(value))
  spawnSyncStub.returns({
    status: 1,
    stderr: `failure ${leakedValues.join(' ')}`,
    stdout: '',
  })

  expect(call).to.throw().and.satisfy((error: Error) => {
    expect(error.message).to.include('[SCRUBBED]')
    for (const value of leakedValues) expect(error.message).to.not.include(value)
    return true
  })
}

describe('WindowsHandler', function () {
  let handler: WindowsHandler
  let spawnSyncStub: sinon.SinonStub

  beforeEach(function () {
    spawnSyncStub = sinon.stub(childProcess, 'spawnSync')
    handler = new WindowsHandler()
  })

  afterEach(function () {
    spawnSyncStub.restore()
  })

  describe('PowerShell invocation', function () {
    it('uses fixed source and argv while transporting adversarial values safely', function () {
      const account = 'user\'"; $(Write-Output owned); `whoami`\nnext@example.com'
      const service = 'service\'"; $(Write-Output owned); `whoami`\nnext'
      const token = 'tökén\'"; $(Write-Output owned); `whoami`\nnext'

      spawnSyncStub.onCall(0).returns({status: 0, stderr: '', stdout: encode(token)})
      spawnSyncStub.onCall(1).returns({status: 0, stderr: '', stdout: encode(account)})
      spawnSyncStub.onCall(2).returns({status: 0, stderr: '', stdout: ''})
      spawnSyncStub.onCall(3).returns({status: 0, stderr: '', stdout: ''})

      expect(handler.getAuth(account, service)).to.equal(token)
      expect(handler.listAccounts(service)).to.deep.equal([account])
      handler.removeAuth(account, service)
      handler.saveAuth({account, service, token})

      const expectedArgv = spawnSyncStub.args[0][1]
      for (const invocation of spawnSyncStub.args) {
        const [command, argv, options] = invocation
        expect(command).to.equal('powershell.exe')
        expect(argv).to.deep.equal(expectedArgv)
        expect(options.shell).to.not.equal(true)

        const executableText = [command, ...argv].join(' ')
        expect(executableText).to.not.include(account)
        expect(executableText).to.not.include(service)
        expect(executableText).to.not.include(token)
        expect(executableText).to.not.include(encode(account))
        expect(executableText).to.not.include(encode(service))
        expect(executableText).to.not.include(encode(token))
      }

      expect(spawnSyncStub.args[0][2].env.HEROKU_CREDENTIAL_ACCOUNT).to.equal(encode(account))
      expect(spawnSyncStub.args[0][2].env.HEROKU_CREDENTIAL_SERVICE).to.equal(encode(service))
      expect(spawnSyncStub.args[0][2].input).to.equal('')
      expect(spawnSyncStub.args[1][2].env.HEROKU_CREDENTIAL_ACCOUNT).to.equal('')
      expect(spawnSyncStub.args[3][2].input).to.equal(encode(token))
    })

    it('keeps the PowerShell template free of TypeScript interpolation', function () {
      const source = fs.readFileSync(new URL('../../src/credential-handlers/windows-handler.ts', import.meta.url), 'utf8')
      const scriptSource = source.match(/const passwordVaultScript = `([\S\s]*?)`/)?.[1]

      expect(scriptSource).to.be.a('string')
      expect(scriptSource).to.not.include('${')
      expect(scriptSource).to.include('$missingCredentialExitCode = 3')
      expect(scriptSource).to.include(`$missingCredentialSentinel = '${missingCredentialSentinel}'`)
    })

    it('rejects NUL values before process transport without exposing their values', function () {
      const calls = [
        () => handler.getAuth('get-account\0private', 'service'),
        () => handler.getAuth('account', 'get-service\0private'),
        () => handler.listAccounts('list-service\0private'),
        () => handler.removeAuth('remove-account\0private', 'service'),
        () => handler.removeAuth('account', 'remove-service\0private'),
        () => handler.saveAuth({account: 'save-account\0private', service: 'service', token: 'token'}),
        () => handler.saveAuth({account: 'account', service: 'save-service\0private', token: 'token'}),
        () => handler.saveAuth({account: 'account', service: 'service', token: 'save-token\0private'}),
      ]

      for (const call of calls) {
        expect(call).to.throw('Credential values must not contain NUL characters').and.not.match(/private/)
      }

      expect(spawnSyncStub.called).to.be.false
    })
  })

  describe('getAuth', function () {
    it('retrieves a UTF-8 token from base64 PowerShell output', function () {
      spawnSyncStub.returns({status: 0, stderr: '', stdout: encode('my-sécret-token\nwith-newline')})

      expect(handler.getAuth('test@example.com', 'heroku-cli')).to.equal('my-sécret-token\nwith-newline')
    })

    it('throws an error when token is empty', function () {
      spawnSyncStub.returns({status: 0, stderr: '', stdout: ''})

      expect(() => handler.getAuth('test@example.com', 'heroku-cli')).to.throw('Failed to retrieve token from Windows Credential Manager: Token not found')
    })

    it('throws a compatible error when retrieval fails', function () {
      spawnSyncStub.returns({status: 1, stderr: 'Permission denied', stdout: ''})

      expect(() => handler.getAuth('test@example.com', 'heroku-cli')).to.throw('Failed to retrieve token from Windows Credential Manager: Permission denied')
    })
  })

  describe('listAccounts', function () {
    it('returns multiple UTF-8 accounts from base64 PowerShell output', function () {
      spawnSyncStub.returns({
        status: 0,
        stderr: '',
        stdout: `${encode('user1@example.com')}\r\n${encode('usér2@example.com')}\r\n`,
      })

      expect(handler.listAccounts('heroku-cli')).to.deep.equal(['user1@example.com', 'usér2@example.com'])
    })

    it('returns an empty array when no credentials are found', function () {
      spawnSyncStub.returns({status: 3, stderr: missingCredentialSentinel, stdout: ''})

      expect(handler.listAccounts('heroku-cli')).to.deep.equal([])
    })

    for (const terminator of ['\n', '\r\n']) {
      it(`accepts a missing-credential sentinel with one ${terminator === '\n' ? 'LF' : 'CRLF'} terminator`, function () {
        spawnSyncStub.returns({status: 3, stderr: `${missingCredentialSentinel}${terminator}`, stdout: ''})

        expect(handler.listAccounts('heroku-cli')).to.deep.equal([])
      })
    }

    const malformedMissingResults = [
      {description: 'leading stderr whitespace', stderr: ` ${missingCredentialSentinel}`, stdout: ''},
      {description: 'trailing stderr whitespace', stderr: `${missingCredentialSentinel} `, stdout: ''},
      {description: 'an extra LF blank line', stderr: `${missingCredentialSentinel}\n\n`, stdout: ''},
      {description: 'an extra CRLF blank line', stderr: `${missingCredentialSentinel}\r\n\r\n`, stdout: ''},
      {description: 'a bare CR terminator', stderr: `${missingCredentialSentinel}\r`, stdout: ''},
      {description: 'whitespace-only stdout', stderr: missingCredentialSentinel, stdout: ' '},
      {description: 'an LF in stdout', stderr: missingCredentialSentinel, stdout: '\n'},
    ]

    for (const malformed of malformedMissingResults) {
      it(`rejects ${malformed.description} in the missing-credential protocol`, function () {
        spawnSyncStub.returns({status: 3, stderr: malformed.stderr, stdout: malformed.stdout})

        expect(() => handler.listAccounts('heroku-cli')).to.throw('Failed to list accounts in Windows Credential Manager')
      })
    }

    it('does not treat an unrelated status 3 as missing credentials', function () {
      spawnSyncStub.returns({status: 3, stderr: 'Unrelated PowerShell failure', stdout: ''})

      expect(() => handler.listAccounts('heroku-cli')).to.throw('Failed to list accounts in Windows Credential Manager: Unrelated PowerShell failure')
    })

    it('requires a clean sentinel-only failure to count as missing credentials', function () {
      spawnSyncStub.returns({status: 3, stderr: `${missingCredentialSentinel}\nUnrelated failure`, stdout: ''})

      expect(() => handler.listAccounts('heroku-cli')).to.throw('Failed to list accounts in Windows Credential Manager')
    })

    it('returns an empty array for successful empty output', function () {
      spawnSyncStub.returns({status: 0, stderr: '', stdout: ''})

      expect(handler.listAccounts('heroku-cli')).to.deep.equal([])
    })

    it('surfaces unrelated vault failures', function () {
      spawnSyncStub.returns({status: 1, stderr: 'PasswordVault access denied', stdout: ''})

      expect(() => handler.listAccounts('heroku-cli')).to.throw('Failed to list accounts in Windows Credential Manager: PasswordVault access denied')
    })

    it('surfaces PowerShell startup failures', function () {
      spawnSyncStub.returns({
        error: new Error('spawn powershell.exe ENOENT'),
        status: 3,
        stderr: '',
        stdout: '',
      })

      expect(() => handler.listAccounts('heroku-cli')).to.throw('Failed to list accounts in Windows Credential Manager: spawn powershell.exe ENOENT')
    })

    it('uses a dedicated status only for the missing-resource HRESULT and rethrows other script errors', function () {
      spawnSyncStub.returns({status: 0, stderr: '', stdout: ''})

      handler.listAccounts('heroku-cli')
      const script = spawnSyncStub.args[0][1].at(-1)
      expect(script).to.include('-2147023728')
      expect(script).to.include('function Test-HerokuMissingCredential([Exception] $Exception)')
      expect(script).to.include('$Exception = $Exception.InnerException')
      const missingCatchPattern = /if \(Test-HerokuMissingCredential \$_\.Exception\) {\s*\[Console]::Error\.WriteLine\(\$missingCredentialSentinel\)\s*exit \$missingCredentialExitCode/g
      expect([...script.matchAll(missingCatchPattern)]).to.have.length(2)
      expect([...script.matchAll(/\[Console]::Error\.WriteLine\(\$missingCredentialSentinel\)/g)]).to.have.length(2)
      expect(script).to.match(/else\s*{\s*throw\s*}/)
    })
  })

  describe('removeAuth', function () {
    it('removes the credential through the fixed script', function () {
      spawnSyncStub.returns({status: 0, stderr: '', stdout: ''})

      handler.removeAuth('test@example.com', 'heroku-cli')

      expect(spawnSyncStub.calledOnce).to.be.true
      expect(spawnSyncStub.args[0][2].env.HEROKU_CREDENTIAL_OPERATION).to.equal('remove')
    })

    it('surfaces unrelated removal failures', function () {
      spawnSyncStub.returns({status: 1, stderr: 'Permission denied', stdout: ''})

      expect(() => handler.removeAuth('test@example.com', 'heroku-cli')).to.throw('Failed to remove token from Windows Credential Manager: Permission denied')
    })

    it('is idempotent when the credential does not exist', function () {
      spawnSyncStub.returns({status: 3, stderr: missingCredentialSentinel, stdout: ''})

      expect(() => handler.removeAuth('missing@example.com', 'heroku-cli')).to.not.throw()
    })

    it('does not treat an unrelated status 3 as a missing credential', function () {
      spawnSyncStub.returns({status: 3, stderr: 'Unrelated PowerShell failure', stdout: ''})

      expect(() => handler.removeAuth('missing@example.com', 'heroku-cli')).to.throw('Failed to remove token from Windows Credential Manager: Unrelated PowerShell failure')
    })

    it('does not hide a startup error that also has the missing-credential status', function () {
      spawnSyncStub.returns({
        error: new Error('spawn powershell.exe EACCES'),
        status: 3,
        stderr: '',
        stdout: '',
      })

      expect(() => handler.removeAuth('missing@example.com', 'heroku-cli')).to.throw('Failed to remove token from Windows Credential Manager: spawn powershell.exe EACCES')
    })

    const malformedMissingResults = [
      {description: 'leading stderr whitespace', stderr: ` ${missingCredentialSentinel}`, stdout: ''},
      {description: 'trailing stderr whitespace', stderr: `${missingCredentialSentinel} `, stdout: ''},
      {description: 'an extra blank line', stderr: `${missingCredentialSentinel}\r\n\r\n`, stdout: ''},
      {description: 'whitespace-only stdout', stderr: missingCredentialSentinel, stdout: ' '},
    ]

    for (const malformed of malformedMissingResults) {
      it(`does not suppress removal failure with ${malformed.description}`, function () {
        spawnSyncStub.returns({status: 3, stderr: malformed.stderr, stdout: malformed.stdout})

        expect(() => handler.removeAuth('missing@example.com', 'heroku-cli')).to.throw('Failed to remove token from Windows Credential Manager')
      })
    }
  })

  describe('saveAuth', function () {
    it('saves the credential and sends the base64 token over stdin', function () {
      spawnSyncStub.returns({status: 0, stderr: '', stdout: ''})

      handler.saveAuth({account: 'test@example.com', service: 'heroku-cli', token: 'mytökén'})

      expect(spawnSyncStub.calledOnce).to.be.true
      expect(spawnSyncStub.args[0][2].env.HEROKU_CREDENTIAL_OPERATION).to.equal('save')
      expect(spawnSyncStub.args[0][2].input).to.equal(encode('mytökén'))
    })

    it('throws an error when saving fails', function () {
      spawnSyncStub.returns({status: 1, stderr: 'Permission denied', stdout: ''})

      expect(() => handler.saveAuth({account: 'test@example.com', service: 'heroku-cli', token: 'mytoken'})).to.throw('Failed to store token in Windows Credential Manager: Permission denied')
    })

    it('continues only when replacing a missing credential', function () {
      spawnSyncStub.returns({status: 0, stderr: '', stdout: ''})

      handler.saveAuth({account: 'test@example.com', service: 'heroku-cli', token: 'mytoken'})
      const script = spawnSyncStub.args[0][1].at(-1)
      expect(script).to.include("'save' {")
      expect(script).to.include('if (-not (Test-HerokuMissingCredential $_.Exception)) { throw }')
    })

    it('scrubs raw and transported secrets from errors', function () {
      const account = 'test@example.com'
      const service = 'heroku-cli'
      const token = 'mytökén'
      spawnSyncStub.returns({
        status: 1,
        stderr: `failure ${service} ${account} ${token} ${encode(service)} ${encode(account)} ${encode(token)}`,
        stdout: '',
      })

      try {
        handler.saveAuth({account, service, token})
        expect.fail('Should have thrown an error')
      } catch (error) {
        const {message} = error as Error
        expect(message).to.include('Failed to store token in Windows Credential Manager')
        expect(message).to.include('[SCRUBBED]')
        expect(message).to.not.include(account)
        expect(message).to.not.include(service)
        expect(message).to.not.include(token)
        expect(message).to.not.include(encode(account))
        expect(message).to.not.include(encode(service))
        expect(message).to.not.include(encode(token))
      }
    })
  })

  describe('error scrubbing', function () {
    const account = 'account-first\r\naccount-second'
    const service = 'service-first\r\nservice-second'
    const token = 'token-first\r\ntoken-second'

    it('scrubs LF/CRLF raw and base64 variants from get errors', function () {
      expectScrubbed(spawnSyncStub, () => handler.getAuth(account, service), [account, service])
    })

    it('scrubs LF/CRLF raw and base64 variants from list errors', function () {
      expectScrubbed(spawnSyncStub, () => handler.listAccounts(service), [service])
    })

    it('scrubs LF/CRLF raw and base64 variants from remove errors', function () {
      expectScrubbed(spawnSyncStub, () => handler.removeAuth(account, service), [account, service])
    })

    it('scrubs LF/CRLF raw and base64 variants from save errors', function () {
      expectScrubbed(spawnSyncStub, () => handler.saveAuth({account, service, token}), [account, service, token])
    })
  })

  describe('process signals', function () {
    const operations: Array<{invoke: (subject: WindowsHandler) => unknown; name: string; prefix: string}> = [
      {invoke: subject => subject.getAuth('account', 'service'), name: 'getAuth', prefix: 'Failed to retrieve token from Windows Credential Manager'},
      {invoke: subject => subject.listAccounts('service'), name: 'listAccounts', prefix: 'Failed to list accounts in Windows Credential Manager'},
      {invoke: subject => subject.removeAuth('account', 'service'), name: 'removeAuth', prefix: 'Failed to remove token from Windows Credential Manager'},
      {invoke: subject => subject.saveAuth({account: 'account', service: 'service', token: 'token'}), name: 'saveAuth', prefix: 'Failed to store token in Windows Credential Manager'},
    ]

    for (const operation of operations) {
      it(`prioritizes a process error over a signal for ${operation.name}`, function () {
        spawnSyncStub.returns({
          error: new Error('spawn powershell.exe EACCES'), signal: 'SIGTERM', status: null, stderr: 'misleading diagnostic', stdout: '',
        })

        expect(() => operation.invoke(handler)).to.throw(`${operation.prefix}: spawn powershell.exe EACCES`)
      })

      it(`prioritizes a signal over status and stderr for ${operation.name}`, function () {
        spawnSyncStub.returns({
          signal: 'SIGTERM', status: 3, stderr: missingCredentialSentinel, stdout: '',
        })

        expect(() => operation.invoke(handler)).to.throw(`${operation.prefix}: terminated by signal SIGTERM`)
      })
    }
  })
})
