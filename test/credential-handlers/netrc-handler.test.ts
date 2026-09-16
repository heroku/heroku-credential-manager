import {expect, use} from 'chai'
import chaiAsPromised from 'chai-as-promised'
import fs from 'fs-extra'
import {type ChildProcess, spawn} from 'node:child_process'
import nativeFs from 'node:fs'
import os from 'node:os'
import {join, resolve as resolvePath} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import sinon from 'sinon'

import {type MachineToken, parse} from '../../src/lib/netrc-parser.js'

use(chaiAsPromised)

import {NetrcHandler} from '../../src/credential-handlers/netrc-handler.js'
import {NetrcPostCommitError} from '../../src/netrc-post-commit-error.js'
import {restoreNetrcStub, stubNetrc} from '../helpers/netrc-stub.js'

async function waitForPath(file: string, timeoutMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  /* eslint-disable no-await-in-loop */
  while (Date.now() < deadline) {
    if (await fs.pathExists(file)) return true
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
  }
  /* eslint-enable no-await-in-loop */

  return fs.pathExists(file)
}

async function writeLockOwner(lockPath: string, owner: {
  createdAt: number
  hostname: string
  nonce: string
  pid: number
  processStartedAt?: number
}, updatedAt = new Date()): Promise<void> {
  await fs.writeJson(lockPath, owner, {mode: 0o600})
  await fs.utimes(lockPath, updatedAt, updatedAt)
}

describe('NetrcHandler', function () {
  beforeEach(stubNetrc)

  afterEach(restoreNetrcStub)

  describe('get auth', function () {
    it('should get auth for a specified host', async function () {
      const handler = new NetrcHandler()
      const auth = await handler.getAuth('api.heroku.com')
      expect(auth).to.deep.equal({login: 'test@example.com', password: 'mypass'})
    })

    it('should error if no auth is saved for the specified host', async function () {
      const handler = new NetrcHandler()
      await expect(handler.getAuth('fake.heroku.com')).to.be.rejectedWith('No auth found for fake.heroku.com')
    })
  })

  describe('remove auth', function () {
    it('should remove auth for a specified host', async function () {
      const handler = new NetrcHandler()
      await handler.removeAuth('api.heroku.com')
      expect(handler.netrc.machines['api.heroku.com']).to.be.undefined
    })

    it('should do nothing if no auth is saved for the specified host', async function () {
      const handler = new NetrcHandler()
      await handler.removeAuth('fake.heroku.com')
      expect(handler.netrc.machines['fake.heroku.com']).to.be.undefined
    })
  })

  describe('save auth', function () {
    it('should save auth for a specified host', async function () {
      const handler = new NetrcHandler()
      await handler.saveAuth({login: 'test@example.com', password: 'mypass'}, 'new.heroku.com')
      expect(handler.netrc.machines['new.heroku.com']).to.deep.equal({login: 'test@example.com', password: 'mypass'})
    })

    it('should remove method and org entries for the specified host if present', async function () {
      const handler = new NetrcHandler()
      await handler.saveAuth({login: 'test@example.com', password: 'mypass'}, 'api.heroku.com')
      handler.netrc.machines['api.heroku.com'].method = 'gpg'
      handler.netrc.machines['api.heroku.com'].org = 'test'
      await handler.saveAuth({login: 'test@example.com', password: 'mypass'}, 'api.heroku.com')
      expect(handler.netrc.machines['api.heroku.com']).to.deep.equal({login: 'test@example.com', password: 'mypass'})
      expect(handler.netrc.machines['api.heroku.com'].method).to.be.undefined
      expect(handler.netrc.machines['api.heroku.com'].org).to.be.undefined
    })

    it('adds internal-whitespace value if _tokens array is present for specified host', async function () {
      const handler = new NetrcHandler()
      await handler.saveAuth({login: 'test@example.com', password: 'mypass'}, 'api.heroku.com')
      handler.netrc.machines._tokens = [{host: 'api.heroku.com', props: {}, type: 'machine'}] as MachineToken[]
      await handler.saveAuth({login: 'test@example.com', password: 'mypass'}, 'api.heroku.com')
      expect((handler.netrc.machines._tokens[0] as MachineToken).internalWhitespace).to.equal('\n  ')
    })
  })
})

// This top-level suite is intentionally outside NetrcHandler's prototype stubs.
/* eslint-disable mocha/max-top-level-suites */
describe('NetrcHandler batch netrc persistence', function () {
  let tmpDir: string
  let netrcPath: string

  beforeEach(async function () {
    tmpDir = resolvePath('tmp/netrc-handler-batch')
    await fs.mkdirp(tmpDir)
    netrcPath = resolvePath(tmpDir, `n-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fs.writeFile(netrcPath, '', 'utf8')
  })

  afterEach(async function () {
    sinon.restore()
    await fs.remove(tmpDir)
  })

  it('saveAuthForHosts writes multiple hosts to disk with a single load and save', async function () {
    const handler = new NetrcHandler(netrcPath)
    const load = sinon.spy(handler.netrc, 'load')
    const save = sinon.spy(handler.netrc, 'save')

    await handler.saveAuthForHosts({login: 'u@e.com', password: 'tok'}, ['a.com', 'b.com'])
    expect(load.callCount).to.equal(1)
    expect(save.callCount).to.equal(1)
    const persisted = new NetrcHandler(netrcPath)
    await persisted.netrc.load()
    expect(persisted.netrc.machines['a.com']).to.deep.equal({login: 'u@e.com', password: 'tok'})
    expect(persisted.netrc.machines['b.com']).to.deep.equal({login: 'u@e.com', password: 'tok'})
  })

  describe('batch validation and conditional removal', function () {
    for (const hosts of [[], [''], ['   '], ['a.com', '']]) {
      it(`saveAuthForHosts rejects invalid hosts ${JSON.stringify(hosts)} before loading netrc`, async function () {
        let loadCalls = 0
        const handler = new NetrcHandler(netrcPath)
        handler.netrc.load = async () => {
          loadCalls++
        }

        await expect(handler.saveAuthForHosts({login: 'u@e.com', password: 'tok'}, hosts))
          .to.be.rejectedWith(Error, 'Cannot save credentials to netrc: provide at least one valid, non-empty host')
        expect(loadCalls).to.equal(0)
        expect(handler.netrc.machines?.['']).to.be.undefined
      })
    }

    it('removeAuthForHosts removes only supplied hosts with an exactly matching login using one load and save', async function () {
      let loadCalls = 0
      let saveCalls = 0
      const handler = new NetrcHandler(netrcPath)
      handler.netrc.load = async () => {
        loadCalls++
        handler.netrc.machines = parse(`machine api.heroku.com login u@e.com password api-token
machine git.heroku.com login u@e.com password git-token
machine other.heroku.com login other@e.com password other-token
machine unsupplied.heroku.com login u@e.com password unsupplied-token
`)
      }

      handler.netrc.save = async () => {
        saveCalls++
      }

      await handler.removeAuthForHosts(['api.heroku.com', 'git.heroku.com', 'other.heroku.com', 'api.heroku.com'], 'u@e.com')
      expect(loadCalls).to.equal(1)
      expect(saveCalls).to.equal(1)
      expect(handler.netrc.machines['api.heroku.com']).to.be.undefined
      expect(handler.netrc.machines['git.heroku.com']).to.be.undefined
      expect(handler.netrc.machines['other.heroku.com'].login).to.equal('other@e.com')
      expect(handler.netrc.machines['unsupplied.heroku.com'].login).to.equal('u@e.com')
    })

    it('removeAuthForHosts preserves entries with different or missing logins without saving', async function () {
      let loadCalls = 0
      let saveCalls = 0
      const handler = new NetrcHandler(netrcPath)
      handler.netrc.load = async () => {
        loadCalls++
        handler.netrc.machines = parse(`machine different.heroku.com login other@e.com password other-token
machine case.heroku.com login U@E.COM password case-token
machine missing.heroku.com password missing-login-token
`)
      }

      handler.netrc.save = async () => {
        saveCalls++
      }

      await handler.removeAuthForHosts(['different.heroku.com', 'case.heroku.com', 'missing.heroku.com', 'absent.heroku.com'], 'u@e.com')
      expect(loadCalls).to.equal(1)
      expect(saveCalls).to.equal(0)
      expect(handler.netrc.machines['different.heroku.com'].login).to.equal('other@e.com')
      expect(handler.netrc.machines['case.heroku.com'].login).to.equal('U@E.COM')
      expect(handler.netrc.machines['missing.heroku.com'].login).to.be.undefined
    })

    it('removeAuthForHosts preserves a matching account with a different password', async function () {
      let saveCalls = 0
      const handler = new NetrcHandler(netrcPath)
      handler.netrc.load = async () => {
        handler.netrc.machines = parse('machine api.heroku.com login u@e.com password newer-token\n')
      }

      handler.netrc.save = async () => {
        saveCalls++
      }

      await handler.removeAuthForHosts(['api.heroku.com'], 'u@e.com', 'older-token')
      expect(saveCalls).to.equal(0)
      expect(handler.netrc.machines['api.heroku.com']).to.deep.equal({login: 'u@e.com', password: 'newer-token'})
    })

    it('removeAuthForHosts removes an entry matching both account and password', async function () {
      let saveCalls = 0
      const handler = new NetrcHandler(netrcPath)
      handler.netrc.load = async () => {
        handler.netrc.machines = parse('machine api.heroku.com login u@e.com password token\n')
      }

      handler.netrc.save = async () => {
        saveCalls++
      }

      await handler.removeAuthForHosts(['api.heroku.com'], 'u@e.com', 'token')
      expect(saveCalls).to.equal(1)
      expect(handler.netrc.machines['api.heroku.com']).to.be.undefined
    })

    it('removeAuthForHosts supports password-only conditional removal', async function () {
      const handler = new NetrcHandler(netrcPath)
      handler.netrc.load = async () => {
        handler.netrc.machines = parse(`machine matching.heroku.com login first@e.com password token
machine different.heroku.com login second@e.com password newer-token
`)
      }

      handler.netrc.save = async () => {}

      await handler.removeAuthForHosts(['matching.heroku.com', 'different.heroku.com'], undefined, 'token')
      expect(handler.netrc.machines['matching.heroku.com']).to.be.undefined
      expect(handler.netrc.machines['different.heroku.com']).to.deep.equal({login: 'second@e.com', password: 'newer-token'})
    })

    it('removeAuthForHosts remains unconditional when account and password are undefined', async function () {
      const handler = new NetrcHandler(netrcPath)
      handler.netrc.load = async () => {
        handler.netrc.machines = parse('machine api.heroku.com login any@e.com password any-token\n')
      }

      handler.netrc.save = async () => {}

      await handler.removeAuthForHosts(['api.heroku.com'])
      expect(handler.netrc.machines['api.heroku.com']).to.be.undefined
    })

    for (const hosts of [[''], ['   '], ['a.com', 'bad host'], ['bad\0host']]) {
      it(`removeAuthForHosts rejects invalid hosts ${JSON.stringify(hosts)} before loading netrc`, async function () {
        let loadCalls = 0
        const handler = new NetrcHandler(netrcPath)
        handler.netrc.load = async () => {
          loadCalls++
        }

        await expect(handler.removeAuthForHosts(hosts, 'u@e.com'))
          .to.be.rejectedWith(Error, 'Cannot remove credentials from netrc: provide at least one valid, non-empty host')
        expect(loadCalls).to.equal(0)
      })
    }

    it('removeAuthForHosts does not load or save for an empty host list', async function () {
      let loadCalls = 0
      let saveCalls = 0
      const handler = new NetrcHandler(netrcPath)
      handler.netrc.load = async () => {
        loadCalls++
      }

      handler.netrc.save = async () => {
        saveCalls++
      }

      await handler.removeAuthForHosts([], 'u@e.com')
      expect(loadCalls).to.equal(0)
      expect(saveCalls).to.equal(0)
    })
  })
})

// Child-process tests intentionally use another top-level suite so the prototype stubs above cannot affect them.
describe('NetrcHandler cross-process mutations', function () {
  const workerTimeoutMs = 30_000
  const children = new Set<ChildProcess>()
  let tmpDir: string
  let netrcPath: string
  let worker: string
  let workerLoader: string

  beforeEach(async function () {
    worker = fileURLToPath(new URL('../helpers/netrc-worker.mjs', import.meta.url))
    workerLoader = pathToFileURL(resolvePath('node_modules/ts-node/esm.mjs')).href
    tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'heroku-netrc-handler-'))
    netrcPath = join(tmpDir, 'netrc')
    await fs.writeFile(netrcPath, '', {mode: 0o600})
  })

  afterEach(async function () {
    sinon.restore()
    await Promise.all([...children].map(child => new Promise<void>(resolve => {
      const cleanupTimeout = setTimeout(resolve, 2000)
      child.once('close', () => {
        clearTimeout(cleanupTimeout)
        resolve()
      })
      child.kill('SIGKILL')
    })))
    children.clear()
    await fs.remove(tmpDir)
  })

  async function runWorkers(operations: Array<{host: string, operation: 'remove' | 'save'}>): Promise<void> {
    const startAt = Date.now() + 750
    const saveAt = startAt + 750
    await Promise.all(operations.map(({host, operation}) => new Promise<void>((resolve, reject) => {
      const workerEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => (
        name !== 'NODE_OPTIONS' && name !== 'NODE_V8_COVERAGE' && !name.startsWith('TS_NODE_')
      )))
      const child = spawn(process.execPath, [
        '--loader',
        workerLoader,
        worker,
        operation,
        netrcPath,
        host,
        String(startAt),
        String(saveAt),
      ], {
        env: {
          ...workerEnvironment,
          TS_NODE_PROJECT: resolvePath('test/tsconfig.json'),
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      })
      children.add(child)
      let stderr = ''
      let settled = false
      let timedOut = false
      const timeout = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, workerTimeoutMs)
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk
      })
      child.once('error', error => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        children.delete(child)
        reject(error)
      })
      child.once('close', (code, signal) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        children.delete(child)
        if (timedOut) reject(new Error(`netrc worker timed out after ${workerTimeoutMs}ms and was killed: ${stderr}`))
        else if (code === 0) resolve()
        else reject(new Error(`netrc worker exited ${code ?? signal}: ${stderr}`))
      })
    })))
  }

  function spawnWorker(
    host: string,
    {loadedMarker, saveAt = Date.now(), startedMarker}: {loadedMarker?: string; saveAt?: number; startedMarker?: string} = {},
  ): {child: ChildProcess; completed: Promise<void>} {
    const workerEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => (
      name !== 'NODE_OPTIONS' && name !== 'NODE_V8_COVERAGE' && !name.startsWith('TS_NODE_')
    )))
    const child = spawn(process.execPath, [
      '--loader',
      workerLoader,
      worker,
      'save',
      netrcPath,
      host,
      String(Date.now()),
      String(saveAt),
      startedMarker ?? '',
      loadedMarker ?? '',
    ], {
      env: {...workerEnvironment, TS_NODE_PROJECT: resolvePath('test/tsconfig.json')},
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    children.add(child)
    const completed = new Promise<void>((resolve, reject) => {
      let stderr = ''
      const timeout = setTimeout(() => child.kill('SIGKILL'), workerTimeoutMs)
      child.stderr!.setEncoding('utf8')
      child.stderr!.on('data', (chunk: string) => {
        stderr += chunk
      })
      child.once('error', reject)
      child.once('close', (code, signal) => {
        clearTimeout(timeout)
        children.delete(child)
        if (code === 0) resolve()
        else reject(new Error(`netrc worker exited ${code ?? signal}: ${stderr}`))
      })
    })
    return {child, completed}
  }

  it('serializes concurrent saves from independent processes without losing credentials', async function () {
    this.timeout(35_000)
    const hosts = Array.from({length: 8}, (_, index) => `save-${index}.heroku.test`)

    await runWorkers(hosts.map(host => ({host, operation: 'save'})))

    const verifier = new NetrcHandler(netrcPath)
    await verifier.netrc.load()
    for (const host of hosts) {
      expect(verifier.netrc.machines[host]).to.deep.equal({
        login: `${host}@example.com`,
        password: `${host}-token`,
      })
    }
  })

  it('serializes concurrent saves and removals without resurrecting or losing credentials', async function () {
    this.timeout(35_000)
    const removedHosts = Array.from({length: 4}, (_, index) => `remove-${index}.heroku.test`)
    const savedHosts = Array.from({length: 4}, (_, index) => `new-${index}.heroku.test`)
    const initial = removedHosts.map(host => `machine ${host} login old@example.com password old-token\n`).join('')
    await fs.writeFile(netrcPath, initial, {mode: 0o600})

    await runWorkers([
      ...removedHosts.map(host => ({host, operation: 'remove' as const})),
      ...savedHosts.map(host => ({host, operation: 'save' as const})),
    ])

    const verifier = new NetrcHandler(netrcPath)
    await verifier.netrc.load()
    for (const host of removedHosts) expect(verifier.netrc.machines[host]).to.equal(undefined)
    for (const host of savedHosts) expect(verifier.netrc.machines[host]?.password).to.equal(`${host}-token`)
  })

  it('recovers a stale lock left by a crashed process', async function () {
    const lockPath = `${netrcPath}.lock`
    const old = new Date(Date.now() - 60_000)
    await writeLockOwner(lockPath, {
      createdAt: Date.now() - 60_000,
      hostname: os.hostname(),
      nonce: 'crashed-owner',
      pid: 2_147_483_647,
    }, old)

    await new NetrcHandler(netrcPath).saveAuth({login: 'new@example.com', password: 'new-token'}, 'new.heroku.test')

    expect(await fs.pathExists(lockPath)).to.equal(false)
    const verifier = new NetrcHandler(netrcPath)
    await verifier.netrc.load()
    expect(verifier.netrc.machines['new.heroku.test']?.password).to.equal('new-token')
  })

  it('recovers a lock after its owning process crashes', async function () {
    const loadedMarker = join(tmpDir, 'crashed-loaded')
    const crashed = spawnWorker('crashed.heroku.test', {loadedMarker, saveAt: Date.now() + 60_000})
    expect(await waitForPath(loadedMarker, 10_000)).to.equal(true)
    crashed.child.kill('SIGKILL')
    await expect(crashed.completed).to.be.rejectedWith('SIGKILL')

    await new NetrcHandler(netrcPath).saveAuth({login: 'new@example.com', password: 'new-token'}, 'new.heroku.test')

    const verifier = new NetrcHandler(netrcPath)
    await verifier.netrc.load()
    expect(verifier.netrc.machines['new.heroku.test']?.password).to.equal('new-token')
    expect(verifier.netrc.machines['crashed.heroku.test']).to.equal(undefined)
  })

  it('fails closed for an old same-process lock that may belong to another loaded module or realm', async function () {
    const lockPath = `${netrcPath}.lock`
    const old = new Date(Date.now() - 60_000)
    await writeLockOwner(lockPath, {
      createdAt: Date.now() - 60_000,
      hostname: os.hostname(),
      nonce: 'live-owner',
      pid: process.pid,
      processStartedAt: Date.now() - (process.uptime() * 1000),
    }, old)
    const startedAt = Date.now()
    let nowCalls = 0
    sinon.stub(Date, 'now').callsFake(() => nowCalls++ === 0 ? startedAt : startedAt + 11_000)

    const mutation = new NetrcHandler(netrcPath).saveAuth(
      {login: 'new@example.com', password: 'new-token'},
      'new.heroku.test',
    )
    await expect(mutation).to.be.rejectedWith('Timed out waiting for netrc lock')

    expect(await fs.readJson(lockPath)).to.include({nonce: 'live-owner'})
  })

  it('does not steal an old lock while its same-host owner PID is alive', async function () {
    const lockPath = `${netrcPath}.lock`
    const live = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60_000)'], {stdio: 'ignore'})
    children.add(live)
    const old = new Date(Date.now() - 60_000)
    await writeLockOwner(lockPath, {
      createdAt: Date.now() - 60_000,
      hostname: os.hostname(),
      nonce: 'paused-live-owner',
      pid: live.pid!,
    }, old)

    let settled = false
    const mutation = new NetrcHandler(netrcPath).saveAuth(
      {login: 'new@example.com', password: 'new-token'},
      'new.heroku.test',
    ).finally(() => {
      settled = true
    })
    await new Promise(resolve => {
      setTimeout(resolve, 250)
    })

    expect(settled).to.equal(false)
    expect(await fs.readJson(lockPath)).to.include({nonce: 'paused-live-owner'})
    live.kill('SIGKILL')
    await mutation
  })

  it('does not reclaim an old owner when its PID may have been reused', async function () {
    const lockPath = `${netrcPath}.lock`
    const old = new Date(Date.now() - 60_000)
    await writeLockOwner(lockPath, {
      createdAt: Date.now() - 60_000,
      hostname: os.hostname(),
      nonce: 'possibly-reused-pid',
      pid: process.pid,
      processStartedAt: Date.now() - (process.uptime() * 1000) - 60_000,
    }, old)
    const startedAt = Date.now()
    let nowCalls = 0
    sinon.stub(Date, 'now').callsFake(() => nowCalls++ === 0 ? startedAt : startedAt + 11_000)

    const mutation = new NetrcHandler(netrcPath).saveAuth(
      {login: 'new@example.com', password: 'new-token'},
      'new.heroku.test',
    )
    await expect(mutation).to.be.rejectedWith('Timed out waiting for netrc lock')

    expect(await fs.readJson(lockPath)).to.include({nonce: 'possibly-reused-pid'})
  })

  it('rolls back a published lock when candidate unlink fails and permits the next mutation', async function () {
    const lockPath = `${netrcPath}.lock`
    const unlink = nativeFs.promises.unlink.bind(nativeFs.promises)
    let failedCandidateUnlink = false
    sinon.stub(nativeFs.promises, 'unlink').callsFake(async path => {
      if (!failedCandidateUnlink && String(path).startsWith(`${lockPath}.owner.`) && String(path).endsWith('.tmp')) {
        failedCandidateUnlink = true
        throw Object.assign(new Error('candidate unlink failed'), {code: 'EACCES'})
      }

      return unlink(path)
    })

    await expect(new NetrcHandler(netrcPath).saveAuth(
      {login: 'first@example.com', password: 'first-token'},
      'first.heroku.test',
    )).to.be.rejectedWith('candidate unlink failed')

    expect(await fs.pathExists(lockPath)).to.equal(false)
    expect((await fs.readdir(tmpDir)).filter(entry => entry.includes('.owner.'))).to.have.length(1)

    await new NetrcHandler(netrcPath).saveAuth(
      {login: 'second@example.com', password: 'second-token'},
      'second.heroku.test',
    )
    expect(await fs.pathExists(lockPath)).to.equal(false)
    const verifier = new NetrcHandler(netrcPath)
    await verifier.netrc.load()
    expect(verifier.netrc.machines['second.heroku.test']?.password).to.equal('second-token')
  })

  it('propagates EEXIST from candidate sync instead of treating it as lock contention', async function () {
    const lockPath = `${netrcPath}.lock`
    const open = nativeFs.promises.open.bind(nativeFs.promises)
    const link = sinon.spy(nativeFs.promises, 'link')
    let injectedFailure = false
    sinon.stub(nativeFs.promises, 'open').callsFake(async (...arguments_: Parameters<typeof nativeFs.promises.open>) => {
      const handle = await open(...arguments_)
      if (!injectedFailure && String(arguments_[0]).startsWith(`${lockPath}.owner.`)) {
        injectedFailure = true
        sinon.stub(handle, 'sync').rejects(Object.assign(new Error('candidate sync EEXIST'), {code: 'EEXIST'}))
      }

      return handle
    })

    await expect(new NetrcHandler(netrcPath).saveAuth(
      {login: 'first@example.com', password: 'first-token'},
      'first.heroku.test',
    )).to.be.rejectedWith('candidate sync EEXIST')

    expect(link.callCount).to.equal(0)
    expect(await fs.pathExists(lockPath)).to.equal(false)
    expect((await fs.readdir(tmpDir)).filter(entry => entry.includes('.owner.'))).to.deep.equal([])
  })

  it('retries cleanup close after a pre-link failure and preserves both failures', async function () {
    const lockPath = `${netrcPath}.lock`
    const open = nativeFs.promises.open.bind(nativeFs.promises)
    let close: sinon.SinonStub | undefined
    sinon.stub(nativeFs.promises, 'open').callsFake(async (...arguments_: Parameters<typeof nativeFs.promises.open>) => {
      const handle = await open(...arguments_)
      if (!close && String(arguments_[0]).startsWith(`${lockPath}.owner.`)) {
        sinon.stub(handle, 'sync').rejects(new Error('candidate sync failed'))
        close = sinon.stub(handle, 'close').callThrough()
        close.onFirstCall().rejects(new Error('candidate close failed'))
      }

      return handle
    })

    let failure: unknown
    try {
      await new NetrcHandler(netrcPath).saveAuth(
        {login: 'first@example.com', password: 'first-token'},
        'first.heroku.test',
      )
    } catch (error) {
      failure = error
    }

    expect(failure).to.be.instanceOf(AggregateError)
    const aggregate = failure as AggregateError
    expect((aggregate.errors[0] as Error).message).to.equal('candidate sync failed')
    expect((aggregate.errors[1] as Error).message).to.equal('candidate close failed')
    expect(close?.callCount).to.equal(2)
    expect((await fs.readdir(tmpDir)).filter(entry => entry.includes('.owner.'))).to.deep.equal([])
  })

  it('does not delete a pre-existing candidate when exclusive open reports EEXIST', async function () {
    const lockPath = `${netrcPath}.lock`
    const open = nativeFs.promises.open.bind(nativeFs.promises)
    let candidatePath: string | undefined
    sinon.stub(nativeFs.promises, 'open').callsFake(async (...arguments_: Parameters<typeof nativeFs.promises.open>) => {
      const path = String(arguments_[0])
      if (!candidatePath && path.startsWith(`${lockPath}.owner.`)) {
        candidatePath = path
        await fs.writeFile(path, 'pre-existing candidate', {flag: 'wx'})
      }

      return open(...arguments_)
    })

    await expect(new NetrcHandler(netrcPath).saveAuth(
      {login: 'first@example.com', password: 'first-token'},
      'first.heroku.test',
    )).to.be.rejectedWith('EEXIST')

    expect(candidatePath).not.to.equal(undefined)
    expect(await fs.readFile(candidatePath!, 'utf8')).to.equal('pre-existing candidate')
    expect(await fs.pathExists(lockPath)).to.equal(false)
  })

  it('keeps a contender from loading old state at the destination rename boundary', async function () {
    this.timeout(15_000)
    const firstHost = 'first.heroku.test'
    const contenderHost = 'contender.heroku.test'
    const startedMarker = join(tmpDir, 'contender-started')
    const loadedMarker = join(tmpDir, 'contender-loaded')
    const rename = nativeFs.promises.rename.bind(nativeFs.promises)
    let continueRename!: () => void
    let reachedRename!: () => void
    const mayRename = new Promise<void>(resolve => {
      continueRename = resolve
    })
    const atRename = new Promise<void>(resolve => {
      reachedRename = resolve
    })
    let paused = false
    sinon.stub(nativeFs.promises, 'rename').callsFake(async (source, destination) => {
      if (!paused && destination === netrcPath) {
        paused = true
        reachedRename()
        await mayRename
      }

      return rename(source, destination)
    })

    const first = new NetrcHandler(netrcPath).saveAuth(
      {login: 'first@example.com', password: 'first-token'},
      firstHost,
    )
    await atRename
    const ownerPath = `${netrcPath}.lock`
    const owner = await fs.readJson(ownerPath)
    await fs.writeJson(ownerPath, {...owner, createdAt: Date.now() - 60_000, hostname: 'unknown-paused-host'})
    const old = new Date(Date.now() - 60_000)
    await fs.utimes(ownerPath, old, old)
    const contender = spawnWorker(contenderHost, {loadedMarker, startedMarker})

    try {
      expect(await waitForPath(startedMarker, 10_000)).to.equal(true)
      expect(await waitForPath(loadedMarker, 500), 'contender loaded before the first owner committed and released').to.equal(false)
    } finally {
      continueRename()
    }

    await first
    await contender.completed
    const verifier = new NetrcHandler(netrcPath)
    await verifier.netrc.load()
    expect(verifier.netrc.machines[firstHost]?.password).to.equal('first-token')
    expect(verifier.netrc.machines[contenderHost]?.password).to.equal(`${contenderHost}-token`)
  })

  it('does not delete a replacement owner during a forced stale-break interleaving', async function () {
    const lockPath = `${netrcPath}.lock`
    const displaced = `${lockPath}.displaced`
    const old = new Date(Date.now() - 60_000)
    await writeLockOwner(lockPath, {
      createdAt: Date.now() - 60_000,
      hostname: os.hostname(),
      nonce: 'stale-owner',
      pid: 2_147_483_647,
    }, old)
    const rename = nativeFs.promises.rename.bind(nativeFs.promises)
    sinon.stub(nativeFs.promises, 'rename').callsFake(async (source, destination) => {
      if (source === lockPath && String(destination).startsWith(`${lockPath}.quarantine.`) && !await fs.pathExists(displaced)) {
        await rename(lockPath, displaced)
        await writeLockOwner(lockPath, {
          createdAt: Date.now(), hostname: 'remote-active-owner', nonce: 'replacement-owner', pid: 1234,
        })
      }

      return rename(source, destination)
    })
    const startedAt = Date.now()
    let nowCalls = 0
    sinon.stub(Date, 'now').callsFake(() => nowCalls++ === 0 ? startedAt : startedAt + 11_000)

    const mutation = new NetrcHandler(netrcPath).saveAuth(
      {login: 'new@example.com', password: 'new-token'},
      'new.heroku.test',
    )
    await expect(mutation).to.be.rejectedWith('Timed out waiting for netrc lock')

    expect(await fs.readJson(lockPath)).to.include({nonce: 'replacement-owner'})
    expect(await fs.readJson(displaced)).to.include({nonce: 'stale-owner'})
  })

  it('commits successfully but reports release failure without unlinking a replacement owner', async function () {
    const lockPath = `${netrcPath}.lock`
    const displaced = `${lockPath}.displaced`
    const rename = nativeFs.promises.rename.bind(nativeFs.promises)
    let netrcCommitted = false
    sinon.stub(nativeFs.promises, 'rename').callsFake(async (source, destination) => {
      if (destination === netrcPath) netrcCommitted = true
      if (netrcCommitted && source === lockPath && String(destination).startsWith(`${lockPath}.quarantine.`)) {
        netrcCommitted = false
        await rename(lockPath, displaced)
        await writeLockOwner(lockPath, {
          createdAt: Date.now(), hostname: 'remote-active-owner', nonce: 'replacement-owner', pid: 1234,
        })
      }

      return rename(source, destination)
    })

    let failure: unknown
    try {
      await new NetrcHandler(netrcPath).saveAuth(
        {login: 'new@example.com', password: 'new-token'},
        'new.heroku.test',
      )
    } catch (error) {
      failure = error
    }

    expect(failure).to.be.instanceOf(NetrcPostCommitError)
    expect((failure as NetrcPostCommitError).cause).to.be.an('error').with.property('message').that.includes('ownership was lost before release')
    const verifier = new NetrcHandler(netrcPath)
    await verifier.netrc.load()
    expect(verifier.netrc.machines['new.heroku.test']).to.deep.equal({
      login: 'new@example.com',
      password: 'new-token',
    })
    expect(await fs.readJson(lockPath)).to.include({nonce: 'replacement-owner'})
    expect(await fs.readJson(displaced)).to.have.property('nonce')
  })

  it('preserves post-commit save and lock-release failures without unlinking a replacement owner', async function () {
    if (process.platform === 'win32') this.skip()
    const lockPath = `${netrcPath}.lock`
    const displaced = `${lockPath}.displaced`
    const rename = nativeFs.promises.rename.bind(nativeFs.promises)
    const open = nativeFs.promises.open.bind(nativeFs.promises)
    const durabilityFailure = new Error('directory sync failed')
    const replacementOwner = {
      createdAt: Date.now(), hostname: 'remote-active-owner', nonce: 'replacement-owner', pid: 1234,
    }
    let netrcCommitted = false
    sinon.stub(nativeFs.promises, 'open').callsFake(async (...arguments_: Parameters<typeof nativeFs.promises.open>) => {
      const handle = await open(...arguments_)
      if (String(arguments_[0]) === tmpDir) sinon.stub(handle, 'sync').rejects(durabilityFailure)
      return handle
    })
    sinon.stub(nativeFs.promises, 'rename').callsFake(async (source, destination) => {
      if (destination === netrcPath) netrcCommitted = true
      if (netrcCommitted && source === lockPath && String(destination).startsWith(`${lockPath}.quarantine.`)) {
        netrcCommitted = false
        await rename(lockPath, displaced)
        await writeLockOwner(lockPath, replacementOwner)
      }

      return rename(source, destination)
    })

    let failure: unknown
    try {
      await new NetrcHandler(netrcPath).saveAuth(
        {login: 'new@example.com', password: 'new-token'},
        'new.heroku.test',
      )
    } catch (error) {
      failure = error
    }

    expect(failure).to.be.instanceOf(AggregateError)
    const aggregate = failure as AggregateError
    expect(aggregate.message).to.equal('Netrc mutation failed and lock release also failed')
    expect(aggregate.errors).to.have.length(2)
    expect(aggregate.errors[0]).to.be.instanceOf(NetrcPostCommitError)
    expect((aggregate.errors[0] as NetrcPostCommitError).cause).to.equal(durabilityFailure)
    expect(aggregate.cause).to.equal(aggregate.errors[0])
    expect(aggregate.errors[1]).to.be.an('error').with.property('message').that.includes('ownership was lost before release')
    const verifier = new NetrcHandler(netrcPath)
    await verifier.netrc.load()
    expect(verifier.netrc.machines['new.heroku.test']).to.deep.equal({
      login: 'new@example.com',
      password: 'new-token',
    })
    expect(await fs.readJson(lockPath)).to.deep.equal(replacementOwner)
    expect(await fs.readJson(displaced)).to.have.property('nonce')
  })

  it('reports an ordinary release error when a no-op removal did not commit', async function () {
    const lockPath = `${netrcPath}.lock`
    const displaced = `${lockPath}.displaced`
    const rename = nativeFs.promises.rename.bind(nativeFs.promises)
    sinon.stub(nativeFs.promises, 'rename').callsFake(async (source, destination) => {
      if (source === lockPath && String(destination).startsWith(`${lockPath}.quarantine.`)) {
        await rename(lockPath, displaced)
        await writeLockOwner(lockPath, {
          createdAt: Date.now(), hostname: 'remote-active-owner', nonce: 'replacement-owner', pid: 1234,
        })
      }

      return rename(source, destination)
    })

    let failure: unknown
    try {
      await new NetrcHandler(netrcPath).removeAuth('absent.heroku.test')
    } catch (error) {
      failure = error
    }

    expect(failure).to.be.instanceOf(Error)
    expect(failure).not.to.be.instanceOf(NetrcPostCommitError)
    expect((failure as Error).message).to.include('ownership was lost before release')
    expect(await fs.readFile(netrcPath, 'utf8')).to.equal('')
    expect(await fs.readJson(lockPath)).to.include({nonce: 'replacement-owner'})
  })

  it('aborts before commit when the owner lock is replaced immediately before ownership assertion', async function () {
    const lockPath = `${netrcPath}.lock`
    const displaced = `${lockPath}.displaced`
    const original = await fs.readFile(netrcPath, 'utf8')
    const handler = new NetrcHandler(netrcPath)
    const save = handler.netrc.save.bind(handler.netrc)
    handler.netrc.save = async assertOwned => {
      await fs.rename(lockPath, displaced)
      await writeLockOwner(lockPath, {
        createdAt: Date.now(), hostname: 'remote-active-owner', nonce: 'replacement-owner', pid: 1234,
      })
      return save(assertOwned)
    }

    let failure: unknown
    try {
      await handler.saveAuth(
        {login: 'new@example.com', password: 'new-token'},
        'new.heroku.test',
      )
    } catch (error) {
      failure = error
    }

    expect(failure).to.be.instanceOf(AggregateError)
    const aggregate = failure as AggregateError
    expect(aggregate.message).to.equal('Netrc mutation failed and lock release also failed')
    expect(aggregate.errors).to.have.length(2)
    expect(aggregate.errors[0]).to.be.an('error').with.property('message').that.includes('Netrc lock ownership was lost')
    expect(aggregate.errors[0]).not.to.be.instanceOf(NetrcPostCommitError)
    expect(aggregate.errors[1]).to.be.an('error').with.property('message').that.includes('ownership was lost before release')
    expect(aggregate.cause).to.equal(aggregate.errors[0])
    expect(await fs.readFile(netrcPath, 'utf8')).to.equal(original)
    expect(await fs.readJson(lockPath)).to.include({nonce: 'replacement-owner'})
    expect((await fs.readdir(tmpDir)).filter(entry => entry.endsWith('.tmp'))).to.deep.equal([])
  })

  it('refuses a symlinked netrc target without reading or modifying its destination', async function () {
    if (process.platform === 'win32') this.skip()
    const destination = join(tmpDir, 'netrc-destination')
    const contents = 'machine existing.heroku.test login existing@example.com password existing-token\n'
    await fs.remove(netrcPath)
    await fs.writeFile(destination, contents)
    await fs.symlink(destination, netrcPath)

    await expect(new NetrcHandler(netrcPath).saveAuth(
      {login: 'new@example.com', password: 'new-token'},
      'new.heroku.test',
    )).to.be.rejectedWith('Refusing to mutate non-regular netrc file')

    expect(await fs.readFile(destination, 'utf8')).to.equal(contents)
  })

  it('refuses a symlinked lock without modifying its destination', async function () {
    if (process.platform === 'win32') this.skip()
    const lockPath = `${netrcPath}.lock`
    const destination = join(tmpDir, 'lock-destination')
    await fs.writeFile(destination, 'unchanged')
    await fs.symlink(destination, lockPath, 'file')

    await expect(new NetrcHandler(netrcPath).saveAuth(
      {login: 'new@example.com', password: 'new-token'},
      'new.heroku.test',
    )).to.be.rejectedWith('Refusing to use symlinked netrc lock')

    expect(await fs.readFile(destination, 'utf8')).to.equal('unchanged')
    expect((await fs.lstat(lockPath)).isSymbolicLink()).to.equal(true)
  })
})
