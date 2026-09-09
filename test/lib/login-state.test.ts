import {expect} from 'chai'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import {join} from 'node:path'
import sinon from 'sinon'

import {deleteLoginState, readLoginState, writeLoginState} from '../../src/lib/login-state.js'

describe('login-state', function () {
  let tmpDir: string

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'heroku-login-state-'))
  })

  afterEach(function () {
    fs.rmSync(tmpDir, {force: true, recursive: true})
    sinon.restore()
  })

  describe('readLoginState', function () {
    it('returns undefined when file does not exist', async function () {
      expect(await readLoginState(tmpDir)).to.be.undefined
    })

    it('reads a valid login state file', async function () {
      fs.writeFileSync(join(tmpDir, 'login.json'), JSON.stringify({account: 'user@example.com'}))
      const result = await readLoginState(tmpDir)
      expect(result).to.deep.equal({account: 'user@example.com'})
    })

    it('returns undefined for malformed JSON', async function () {
      fs.writeFileSync(join(tmpDir, 'login.json'), 'not json')
      expect(await readLoginState(tmpDir)).to.be.undefined
    })

    it('returns undefined when account field is missing', async function () {
      fs.writeFileSync(join(tmpDir, 'login.json'), JSON.stringify({other: 'field'}))
      expect(await readLoginState(tmpDir)).to.be.undefined
    })

    it('returns undefined when account is empty string', async function () {
      fs.writeFileSync(join(tmpDir, 'login.json'), JSON.stringify({account: ''}))
      expect(await readLoginState(tmpDir)).to.be.undefined
    })

    it('returns undefined when account is not a string', async function () {
      fs.writeFileSync(join(tmpDir, 'login.json'), JSON.stringify({account: 123}))
      expect(await readLoginState(tmpDir)).to.be.undefined
    })
  })

  describe('writeLoginState', function () {
    it('creates the file with the account', async function () {
      await writeLoginState(tmpDir, 'user@example.com')
      const content = JSON.parse(fs.readFileSync(join(tmpDir, 'login.json'), 'utf8'))
      expect(content).to.deep.equal({account: 'user@example.com'})
    })

    it('creates the directory if it does not exist', async function () {
      const nestedDir = join(tmpDir, 'nested', 'dir')
      await writeLoginState(nestedDir, 'user@example.com')
      const content = JSON.parse(fs.readFileSync(join(nestedDir, 'login.json'), 'utf8'))
      expect(content).to.deep.equal({account: 'user@example.com'})
    })

    it('creates the directory with 0o700 permissions on non-Windows', async function () {
      if (process.platform === 'win32') this.skip()
      const nestedDir = join(tmpDir, 'private')
      await writeLoginState(nestedDir, 'user@example.com')
      const stats = fs.statSync(nestedDir)
      // eslint-disable-next-line no-bitwise
      expect(stats.mode & 0o777).to.equal(0o700)
    })

    it('serializes only the account and never a token or password', async function () {
      const account = 'user@example.com'
      await writeLoginState(tmpDir, account)
      const raw = fs.readFileSync(join(tmpDir, 'login.json'), 'utf8')
      expect(raw).to.equal(JSON.stringify({account}) + '\n')
      expect(raw).to.not.contain('token')
      expect(raw).to.not.contain('password')
    })

    it('overwrites an existing file', async function () {
      await writeLoginState(tmpDir, 'old@example.com')
      await writeLoginState(tmpDir, 'new@example.com')
      const content = JSON.parse(fs.readFileSync(join(tmpDir, 'login.json'), 'utf8'))
      expect(content).to.deep.equal({account: 'new@example.com'})
    })

    it('sets file permissions to 0o600 on non-Windows', async function () {
      if (process.platform === 'win32') this.skip()
      await writeLoginState(tmpDir, 'user@example.com')
      const stats = fs.statSync(join(tmpDir, 'login.json'))
      // eslint-disable-next-line no-bitwise
      expect(stats.mode & 0o777).to.equal(0o600)
    })

    it('tightens permissions on an existing directory and file on non-Windows', async function () {
      if (process.platform === 'win32') this.skip()
      const dataDir = join(tmpDir, 'permissive')
      const filePath = join(dataDir, 'login.json')
      fs.mkdirSync(dataDir, {mode: 0o755})
      fs.writeFileSync(filePath, JSON.stringify({account: 'old@example.com', password: 'secret', token: 'secret'}), {
        mode: 0o644,
      })
      fs.chmodSync(dataDir, 0o755)
      fs.chmodSync(filePath, 0o644)

      await writeLoginState(dataDir, 'user@example.com')

      // eslint-disable-next-line no-bitwise
      expect(fs.statSync(dataDir).mode & 0o777).to.equal(0o700)
      // eslint-disable-next-line no-bitwise
      expect(fs.statSync(filePath).mode & 0o777).to.equal(0o600)
      const raw = fs.readFileSync(filePath, 'utf8')
      expect(raw).to.equal(JSON.stringify({account: 'user@example.com'}) + '\n')
      expect(raw).to.not.contain('token')
      expect(raw).to.not.contain('password')
    })

    it('refuses a symlinked login state file without changing its destination on non-Windows', async function () {
      if (process.platform === 'win32') this.skip()
      const destination = join(tmpDir, 'destination.json')
      const original = JSON.stringify({account: 'original@example.com'})
      fs.writeFileSync(destination, original)
      fs.symlinkSync('destination.json', join(tmpDir, 'login.json'))

      await assert.rejects(writeLoginState(tmpDir, 'replacement@example.com'))

      expect(fs.readFileSync(destination, 'utf8')).to.equal(original)
      expect(fs.lstatSync(join(tmpDir, 'login.json')).isSymbolicLink()).to.be.true
    })

    it('refuses a symlinked data directory without changing its destination on non-Windows', async function () {
      if (process.platform === 'win32') this.skip()
      const destination = join(tmpDir, 'destination')
      const dataDir = join(tmpDir, 'linked-data')
      const original = JSON.stringify({account: 'original@example.com'})
      fs.mkdirSync(destination)
      fs.writeFileSync(join(destination, 'login.json'), original)
      fs.symlinkSync('destination', dataDir)

      await assert.rejects(writeLoginState(dataDir, 'replacement@example.com'))

      expect(fs.readFileSync(join(destination, 'login.json'), 'utf8')).to.equal(original)
      expect(fs.lstatSync(dataDir).isSymbolicLink()).to.be.true
    })
  })

  describe('deleteLoginState', function () {
    it('deletes the login state file', async function () {
      fs.writeFileSync(join(tmpDir, 'login.json'), JSON.stringify({account: 'user@example.com'}))
      await deleteLoginState(tmpDir)
      expect(fs.existsSync(join(tmpDir, 'login.json'))).to.be.false
    })

    it('does not throw when file does not exist', async function () {
      await deleteLoginState(tmpDir)
    })

    it('does not delete other files in the directory', async function () {
      fs.writeFileSync(join(tmpDir, 'other.json'), 'keep')
      fs.writeFileSync(join(tmpDir, 'login.json'), JSON.stringify({account: 'user@example.com'}))
      await deleteLoginState(tmpDir)
      expect(fs.existsSync(join(tmpDir, 'other.json'))).to.be.true
    })
  })
})
