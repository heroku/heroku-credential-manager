import {randomUUID} from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export type AcceptanceFixture = {
  account: string
  hosts: string[]
  service: string
  token: string
}

export type FakeCredentialStoreSetup = {
  assertShadowed: () => void
  cleanup: () => void
  commandPath: string
  originalPath: string
  tmpDir: string
}

const TEMP_ROOT_ENV = 'CREDENTIAL_ACCEPTANCE_TEMP_ROOT'

/**
 * Creates credentials that cannot collide with a normal Heroku CLI credential.
 * @returns Randomized acceptance fixtures.
 */
export function createAcceptanceFixtures(): Record<'alternateService' | 'default' | 'multipleHosts' | 'secondAccount', AcceptanceFixture> {
  const identifier = randomUUID()
  const service = `heroku-credential-manager-acceptance-${identifier}`
  const host = `acceptance-${identifier}.invalid`
  const account = `acceptance-${identifier}@example.invalid`

  return {
    alternateService: {
      account,
      hosts: [host],
      service: `${service}-alternate-${randomUUID()}`,
      token: `acceptance-alternate-service-token-${identifier}`,
    },
    default: {
      account,
      hosts: [host],
      service,
      token: `acceptance-token-${identifier}`,
    },
    multipleHosts: {
      account: `acceptance-multiple-${identifier}@example.invalid`,
      hosts: [host, `acceptance-alternate-${identifier}.invalid`],
      service,
      token: `acceptance-multiple-token-${identifier}`,
    },
    secondAccount: {
      account: `acceptance-second-${identifier}@example.invalid`,
      hosts: [host],
      service,
      token: `acceptance-second-token-${identifier}`,
    },
  }
}

/**
 * Refuses native-store execution outside explicitly enabled CI.
 * @returns The resolved isolated acceptance home.
 */
export function assertNativeAcceptanceEnvironment(): string {
  if (process.env.CI !== 'true' || process.env.NATIVE_CREDENTIAL_ACCEPTANCE !== 'true') {
    throw new Error('Native credential acceptance is restricted to explicitly enabled ephemeral CI runners.')
  }

  const root = process.env[TEMP_ROOT_ENV]
  if (!root) {
    throw new Error(`${TEMP_ROOT_ENV} must identify the isolated acceptance home.`)
  }

  const resolvedRoot = path.resolve(root)
  for (const variable of ['HOME', 'USERPROFILE'] as const) {
    if (process.env[variable] !== resolvedRoot) {
      throw new Error(`${variable} must equal the isolated acceptance home.`)
    }
  }

  const parsedRoot = path.parse(resolvedRoot).root
  const expectedHomeDrive = process.platform === 'win32' ? parsedRoot.replace(/[/\\]$/, '') : parsedRoot
  const expectedHomePath = resolvedRoot.slice(expectedHomeDrive.length) || path.sep
  const homeDrive = process.env.HOMEDRIVE
  const homePath = process.env.HOMEPATH
  if (!homeDrive) {
    throw new Error('HOMEDRIVE must be set before loading the credential manager.')
  }

  if (homeDrive !== expectedHomeDrive) {
    throw new Error('HOMEDRIVE must be the drive/root of the isolated acceptance home.')
  }

  if (!homePath) {
    throw new Error('HOMEPATH must be set before loading the credential manager.')
  }

  if (homePath !== expectedHomePath) {
    throw new Error('HOMEPATH must be the path portion of the isolated acceptance home.')
  }

  if (`${homeDrive}${homePath}` !== resolvedRoot) {
    throw new Error('HOMEDRIVE and HOMEPATH must compose exactly to the isolated acceptance home.')
  }

  return resolvedRoot
}

/**
 * Hard guard for every acceptance operation that can read or write netrc.
 * A sibling path with the same prefix is deliberately rejected.
 * @param netrcPath Netrc path that the credential manager resolved.
 * @param tempRoot Isolated acceptance home.
 * @returns The resolved, verified netrc path.
 */
export function assertNetrcPathIsIsolated(netrcPath: string, tempRoot = process.env[TEMP_ROOT_ENV]): string {
  if (!tempRoot) {
    throw new Error(`Refusing netrc access: ${TEMP_ROOT_ENV} is not set.`)
  }

  const resolvedRoot = path.resolve(tempRoot)
  const resolvedNetrc = path.resolve(netrcPath)
  const relative = path.relative(resolvedRoot, resolvedNetrc)
  if (relative === '' || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error(`Refusing netrc access outside isolated acceptance home: ${resolvedNetrc}`)
  }

  return resolvedNetrc
}

/**
 * Places a failing native-store executable first on PATH until cleanup completes.
 * @returns A shadow assertion and cleanup handle.
 */
export function setupFakeCredentialStore(): FakeCredentialStoreSetup {
  const root = assertNativeAcceptanceEnvironment()
  const tmpDir = fs.mkdtempSync(path.join(root, 'fake-native-store-'))
  const originalPath = process.env.PATH ?? ''
  const pathSeparator = path.delimiter
  let commandName = 'secret-tool'
  if (process.platform === 'darwin') commandName = 'security'
  if (process.platform === 'win32') commandName = 'powershell.cmd'
  const commandPath = path.join(tmpDir, commandName)
  const script = process.platform === 'win32'
    ? '@echo off\r\nexit /b 1\r\n'
    : '#!/bin/sh\nexit 1\n'

  fs.writeFileSync(commandPath, script, {mode: 0o755})
  // A batch shim may not satisfy Node's explicit `shell: 'powershell'` lookup.
  // Removing the original PATH on Windows guarantees the real shell cannot be reached.
  process.env.PATH = process.platform === 'win32' ? tmpDir : `${tmpDir}${pathSeparator}${originalPath}`

  let cleaned = false
  const assertShadowed = () => {
    const expectedPath = process.platform === 'win32' ? tmpDir : `${tmpDir}${pathSeparator}${originalPath}`
    if (cleaned || process.env.PATH !== expectedPath || !fs.existsSync(commandPath)) {
      throw new Error('Fake native credential store is no longer shadowing the real command.')
    }
  }

  return {
    assertShadowed,
    cleanup() {
      if (cleaned) return
      assertShadowed()
      process.env.PATH = originalPath
      fs.rmSync(tmpDir, {force: true, recursive: true})
      cleaned = true
    },
    commandPath,
    originalPath,
    tmpDir,
  }
}
