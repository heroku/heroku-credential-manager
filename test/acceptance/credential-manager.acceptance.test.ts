import assert from 'node:assert/strict'

import {
  assertNativeAcceptanceEnvironment,
  assertNetrcPathIsIsolated,
  createAcceptanceFixtures,
  type FakeCredentialStoreSetup,
  setupFakeCredentialStore,
} from '../helpers/acceptance-utils.js'

type CredentialManager = typeof import('../../src/index.js')
type TrackedCredential = {account: string, service: string}

function expectedAuth(fixture: {account: string, token: string}) {
  return {account: fixture.account, token: fixture.token}
}

describe('credential manager Phase 1 acceptance', function () {
  let credentialManager: CredentialManager
  let fakeCredentialStore: FakeCredentialStoreSetup | undefined
  let netrcPath: string
  let trackedNativeCredentials: TrackedCredential[]
  let trackedNetrcCredentials: Map<string, Set<string>>
  let fixtures: ReturnType<typeof createAcceptanceFixtures>

  before(async function () {
    if (process.env.CI !== 'true' || process.env.NATIVE_CREDENTIAL_ACCEPTANCE !== 'true') this.skip()

    assertNativeAcceptanceEnvironment()
    fixtures = createAcceptanceFixtures()
    credentialManager = await import('../../src/index.js')
    netrcPath = new credentialManager.Netrc().file
    assertNetrcPathIsIsolated(netrcPath)
  })

  beforeEach(function () {
    trackedNativeCredentials = []
    trackedNetrcCredentials = new Map()
    delete process.env.HEROKU_NETRC_WRITE
  })

  afterEach(async function () {
    try {
      if (fakeCredentialStore) {
        fakeCredentialStore.assertShadowed()
        await cleanupTrackedNetrc()
        fakeCredentialStore.assertShadowed()
      } else {
        await Promise.all(trackedNativeCredentials.map(credential => safeRemove(
          credential.account,
          [],
          credential.service,
        )))
        await cleanupTrackedNetrc()
      }
    } finally {
      fakeCredentialStore?.cleanup()
      fakeCredentialStore = undefined
      delete process.env.HEROKU_NETRC_WRITE
    }
  })

  describe('forced netrc mode', function () {
    beforeEach(function () {
      process.env.HEROKU_NETRC_WRITE = 'true'
    })

    it('saves, gets, and removes credentials for one host', async function () {
      const fixture = fixtures.default
      await assertAbsentFromNativeStore(fixture)
      await safeSave(fixture)
      await assertAbsentFromNativeStore(fixture)
      assert.deepEqual(await safeGet(fixture.account, fixture.hosts[0], fixture.service), expectedAuth(fixture))

      await safeRemove(undefined, fixture.hosts, fixture.service)
      await assert.rejects(safeGet(fixture.account, fixture.hosts[0], fixture.service), /No auth found|No credentials found/)
    })

    it('saves, gets, and removes credentials for multiple hosts', async function () {
      const fixture = fixtures.multipleHosts
      await assertAbsentFromNativeStore(fixture)
      await safeSave(fixture)
      await assertAbsentFromNativeStore(fixture)

      const credentials = await Promise.all(fixture.hosts.map(host => safeGet(fixture.account, host, fixture.service)))
      for (const credential of credentials) assert.deepEqual(credential, expectedAuth(fixture))

      await safeRemove(undefined, fixture.hosts, fixture.service)
      await Promise.all(fixture.hosts.map(host => assert.rejects(
        safeGet(fixture.account, host, fixture.service),
        /No auth found|No credentials found/,
      )))
    })

    it('authoritatively overwrites credentials without writing the native store', async function () {
      const fixture = fixtures.default
      const updated = {...fixture, token: `${fixture.token}-updated`}

      await assertAbsentFromNativeStore(fixture)
      await safeSave(fixture)
      assert.deepEqual(await safeGet(fixture.account, fixture.hosts[0], fixture.service), expectedAuth(fixture))
      await safeSave(updated)

      await assertAbsentFromNativeStore(fixture)
      assert.deepEqual(await safeGet(fixture.account, fixture.hosts[0], fixture.service), expectedAuth(updated))
    })

    it('rejects empty-password and missing netrc credentials', async function () {
      const emptyPassword = {...fixtures.default, token: ''}

      await assertAbsentFromNativeStore(emptyPassword)
      await safeSave(emptyPassword)
      await assertAbsentFromNativeStore(emptyPassword)
      assert.equal((await loadIsolatedNetrc())[emptyPassword.hosts[0]]?.password, undefined)
      await assert.rejects(
        safeGet(emptyPassword.account, emptyPassword.hosts[0], emptyPassword.service),
        /No auth found|No credentials found/,
      )
      await assert.rejects(
        safeGet(fixtures.multipleHosts.account, fixtures.multipleHosts.hosts[1], fixtures.multipleHosts.service),
        /No auth found|No credentials found/,
      )
    })
  })

  describe('native credential store', function () {
    it('saves, gets, lists, and removes exact acceptance entries', async function () {
      const first = fixtures.default
      const second = fixtures.secondAccount
      trackNative(first, second)

      await safeSave(first)
      await safeSave(second)
      assert.deepEqual(await safeGet(first.account, first.hosts[0], first.service), expectedAuth(first))

      const accounts = await credentialManager.listKeychainAccounts(first.service)
      assert(accounts.includes(first.account))
      assert(accounts.includes(second.account))

      await safeRemove(first.account, first.hosts, first.service)
      assert.equal((await credentialManager.listKeychainAccounts(first.service)).includes(first.account), false)
      await assert.rejects(safeGet(first.account, first.hosts[0], first.service), /No auth found|No credentials found/)
    })

    it('does not write netrc after a successful native save', async function () {
      const fixture = fixtures.multipleHosts
      trackNative(fixture)

      await safeSave(fixture)
      const machines = await loadIsolatedNetrc()
      for (const host of fixture.hosts) assert.equal(machines[host], undefined)
    })

    it('authoritatively overwrites an existing native credential', async function () {
      const fixture = fixtures.default
      const updated = {...fixture, token: `${fixture.token}-updated`}
      trackNative(fixture)

      await safeSave(fixture)
      assert.deepEqual(await safeGet(fixture.account, fixture.hosts[0], fixture.service), expectedAuth(fixture))
      await safeSave(updated)

      assert.deepEqual(await safeGet(fixture.account, fixture.hosts[0], fixture.service), expectedAuth(updated))
      assert.equal((await listNativeAccounts(fixture.service)).filter(account => account === fixture.account).length, 1)
    })

    it('isolates the same account under randomized distinct services', async function () {
      const primary = fixtures.default
      const alternate = fixtures.alternateService
      assert.equal(primary.account, alternate.account)
      assert.notEqual(primary.service, alternate.service)
      trackNative(primary, alternate)

      await safeSave(primary)
      await safeSave(alternate)

      assert.deepEqual(await safeGet(primary.account, primary.hosts[0], primary.service), expectedAuth(primary))
      assert.deepEqual(await safeGet(alternate.account, alternate.hosts[0], alternate.service), expectedAuth(alternate))
      assert((await listNativeAccounts(primary.service)).includes(primary.account))
      assert((await listNativeAccounts(alternate.service)).includes(alternate.account))

      await safeRemove(primary.account, primary.hosts, primary.service)
      assert.equal((await listNativeAccounts(primary.service)).includes(primary.account), false)
      assert.deepEqual(await safeGet(alternate.account, alternate.hosts[0], alternate.service), expectedAuth(alternate))
    })
  })

  describe('storage transitions and failures', function () {
    it('cleans both stores after switching from netrc to native mode', async function () {
      const fixture = fixtures.default
      process.env.HEROKU_NETRC_WRITE = 'true'
      await safeSave(fixture)

      delete process.env.HEROKU_NETRC_WRITE
      trackNative(fixture)
      await safeSave(fixture)
      assert.equal((await loadIsolatedNetrc())[fixture.hosts[0]], undefined)
      assert.deepEqual(await safeGet(fixture.account, fixture.hosts[0], fixture.service), expectedAuth(fixture))
      await safeRemove(fixture.account, fixture.hosts, fixture.service)

      assert.equal((await credentialManager.listKeychainAccounts(fixture.service)).includes(fixture.account), false)
      assert.equal((await loadIsolatedNetrc())[fixture.hosts[0]], undefined)
      await assert.rejects(safeGet(fixture.account, fixture.hosts[0], fixture.service), /No auth found|No credentials found/)
    })

    it('writes isolated netrc when native save fails and surfaces later backend errors', async function () {
      const fixture = fixtures.multipleHosts
      fakeCredentialStore = setupFakeCredentialStore()

      await safeSave(fixture)
      fakeCredentialStore.assertShadowed()
      const savedMachines = await loadIsolatedNetrc()
      for (const host of fixture.hosts) {
        assert.equal(savedMachines[host]?.login, fixture.account)
        assert.equal(savedMachines[host]?.password, fixture.token)
      }

      await assert.rejects(safeGet(fixture.account, fixture.hosts[0], fixture.service), /Failed to retrieve token/)

      await safeRemove(fixture.account, fixture.hosts, fixture.service)
      fakeCredentialStore.assertShadowed()
      const machines = await loadIsolatedNetrc()
      for (const host of fixture.hosts) assert.equal(machines[host], undefined)
    })

    it('reads a matching netrc credential after a genuine native miss', async function () {
      const fixture = fixtures.multipleHosts
      process.env.HEROKU_NETRC_WRITE = 'true'
      await safeSave(fixture)

      delete process.env.HEROKU_NETRC_WRITE
      assert.deepEqual(await safeGet(fixture.account, fixture.hosts[0], fixture.service), expectedAuth(fixture))
    })

    it('reports credentials missing from both native storage and netrc', async function () {
      const fixture = fixtures.default
      await assert.rejects(
        safeGet(`missing-${fixture.account}`, fixture.hosts[0], fixture.service),
        /No auth found|No credentials found/,
      )
    })
  })

  async function loadIsolatedNetrc() {
    verifyIsolatedNetrc()
    const netrc = new credentialManager.Netrc()
    assert.equal(assertNetrcPathIsIsolated(netrc.file), netrcPath)
    await netrc.load()
    return netrc.machines
  }

  async function safeGet(account: string | undefined, host: string, service: string) {
    verifyIsolatedNetrc()
    return credentialManager.getAuth(account, host, service)
  }

  async function safeRemove(account: string | undefined, hosts: string[], service: string) {
    verifyIsolatedNetrc()
    return credentialManager.removeAuth(account, hosts, service)
  }

  async function safeSave(fixture: {account: string, hosts: string[], service: string, token: string}) {
    verifyIsolatedNetrc()
    const trackedHosts = trackedNetrcCredentials.get(fixture.service) ?? new Set<string>()
    for (const host of fixture.hosts) trackedHosts.add(host)
    trackedNetrcCredentials.set(fixture.service, trackedHosts)
    return credentialManager.saveAuth(fixture.account, fixture.token, fixture.hosts, fixture.service)
  }

  async function assertAbsentFromNativeStore(fixture: TrackedCredential) {
    const accounts = await listNativeAccounts(fixture.service)
    if (accounts.includes(fixture.account)) trackNative(fixture)
    assert.equal(accounts.includes(fixture.account), false, 'forced-netrc save unexpectedly wrote to the native store')
  }

  async function listNativeAccounts(service: string) {
    verifyIsolatedNetrc()
    const nativeStore = credentialManager.getNativeCredentialStore()
    assert(nativeStore, 'native credential store must be available during native acceptance')
    return credentialManager.getCredentialHandler(nativeStore).listAccounts(service)
  }

  async function cleanupTrackedNetrc() {
    await Promise.all([...trackedNetrcCredentials].map(([service, hosts]) => safeRemove(undefined, [...hosts], service)))
  }

  function trackNative(...credentials: TrackedCredential[]) {
    trackedNativeCredentials.push(...credentials.map(({account, service}) => ({account, service})))
  }

  function verifyIsolatedNetrc() {
    assertNativeAcceptanceEnvironment()
    const resolvedNetrc = new credentialManager.Netrc().file
    assert.equal(assertNetrcPathIsIsolated(resolvedNetrc), netrcPath)
  }
})
