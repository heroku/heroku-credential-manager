import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  assertNativeAcceptanceEnvironment,
  assertNetrcPathIsIsolated,
  createAcceptanceFixtures,
  setupFakeCredentialStore,
} from './acceptance-utils.js'

const ORIGINAL_ENV = {...process.env}

describe('acceptance utils', function () {
  let tempRoot = ''
  let tempParent = ''

  beforeEach(function () {
    tempParent = os.tmpdir()
    tempRoot = fs.mkdtempSync(path.join(tempParent, 'credential-acceptance-utils-'))
    process.env.CI = 'true'
    process.env.NATIVE_CREDENTIAL_ACCEPTANCE = 'true'
    process.env.CREDENTIAL_ACCEPTANCE_TEMP_ROOT = tempRoot
    process.env.HOME = tempRoot
    process.env.USERPROFILE = tempRoot
    const parsedRoot = path.parse(tempRoot).root
    process.env.HOMEDRIVE = process.platform === 'win32' ? parsedRoot.replace(/[/\\]$/, '') : parsedRoot
    process.env.HOMEPATH = tempRoot.slice(process.env.HOMEDRIVE.length) || path.sep
  })

  afterEach(function () {
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, ORIGINAL_ENV)
    fs.rmSync(tempRoot, {force: true, recursive: true})
  })

  it('accepts a netrc path inside the isolated home', function () {
    const netrcPath = path.join(tempRoot, process.platform === 'win32' ? '_netrc' : '.netrc')

    assert.equal(assertNetrcPathIsIsolated(netrcPath), path.resolve(netrcPath))
  })

  it('refuses a netrc path outside the isolated home', function () {
    const outside = path.join(tempParent, 'developer-home', '.netrc')

    assert.throws(
      () => assertNetrcPathIsIsolated(outside),
      /Refusing netrc access outside isolated acceptance home/,
    )
  })

  it('refuses a sibling path that only shares the isolated-home prefix', function () {
    const sibling = path.join(`${tempRoot}-sibling`, '.netrc')

    assert.throws(
      () => assertNetrcPathIsIsolated(sibling),
      /Refusing netrc access outside isolated acceptance home/,
    )
  })

  it('refuses netrc access without an isolated-home marker', function () {
    delete process.env.CREDENTIAL_ACCEPTANCE_TEMP_ROOT

    assert.throws(() => assertNetrcPathIsIsolated(path.join(tempRoot, '.netrc')), /is not set/)
  })

  it('accepts both explicit CI gates and the isolated home variables', function () {
    assert.equal(assertNativeAcceptanceEnvironment(), path.resolve(tempRoot))
  })

  it('refuses a missing CI gate', function () {
    delete process.env.CI

    assert.throws(assertNativeAcceptanceEnvironment, /restricted to explicitly enabled ephemeral CI runners/)
  })

  it('refuses a missing native-acceptance opt-in', function () {
    delete process.env.NATIVE_CREDENTIAL_ACCEPTANCE

    assert.throws(assertNativeAcceptanceEnvironment, /restricted to explicitly enabled ephemeral CI runners/)
  })

  it('refuses a missing isolated temp root', function () {
    delete process.env.CREDENTIAL_ACCEPTANCE_TEMP_ROOT

    assert.throws(assertNativeAcceptanceEnvironment, /must identify the isolated acceptance home/)
  })

  it('refuses a mismatched HOME', function () {
    process.env.HOME = path.join(tempParent, 'not-the-acceptance-home')

    assert.throws(assertNativeAcceptanceEnvironment, /HOME must equal the isolated acceptance home/)
  })

  it('refuses a mismatched USERPROFILE', function () {
    process.env.USERPROFILE = path.join(tempParent, 'not-the-acceptance-home')

    assert.throws(assertNativeAcceptanceEnvironment, /USERPROFILE must equal the isolated acceptance home/)
  })

  it('refuses a missing HOMEDRIVE', function () {
    delete process.env.HOMEDRIVE

    assert.throws(assertNativeAcceptanceEnvironment, /HOMEDRIVE must be set/)
  })

  it('refuses a mismatched HOMEDRIVE', function () {
    process.env.HOMEDRIVE = `${process.env.HOMEDRIVE}-mismatch`

    assert.throws(assertNativeAcceptanceEnvironment, /HOMEDRIVE must be the drive\/root/)
  })

  it('refuses a missing HOMEPATH', function () {
    delete process.env.HOMEPATH

    assert.throws(assertNativeAcceptanceEnvironment, /HOMEPATH must be set/)
  })

  it('refuses a mismatched HOMEPATH', function () {
    process.env.HOMEPATH = `${process.env.HOMEPATH}-mismatch`

    assert.throws(assertNativeAcceptanceEnvironment, /HOMEPATH must be the path portion/)
  })

  it('creates unique non-production credentials', function () {
    const first = createAcceptanceFixtures()
    const second = createAcceptanceFixtures()

    assert.notEqual(first.default.service, second.default.service)
    assert.notEqual(first.default.service, first.alternateService.service)
    assert.equal(first.default.account, first.alternateService.account)
    assert.notEqual(first.default.service, 'heroku-cli')
    assert.match(first.default.account, /^acceptance-/)
    assert.match(first.default.token, /^acceptance-token-/)
  })

  it('keeps the failing native command shadowed until explicit cleanup', function () {
    const originalPath = process.env.PATH ?? ''
    const setup = setupFakeCredentialStore()

    setup.assertShadowed()
    assert.equal(process.env.PATH?.split(path.delimiter)[0], setup.tmpDir)
    if (process.platform === 'win32') assert.equal(process.env.PATH, setup.tmpDir)
    assert.equal(fs.existsSync(setup.commandPath), true)

    setup.cleanup()
    setup.cleanup()
    assert.equal(process.env.PATH, originalPath)
    assert.equal(fs.existsSync(setup.tmpDir), false)
  })
})
