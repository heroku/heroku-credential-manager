import {execFileSync, spawnSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

if (process.env.CI !== 'true' || process.env.NATIVE_CREDENTIAL_ACCEPTANCE !== 'true') {
  throw new Error('Native credential acceptance is restricted to explicitly enabled ephemeral CI runners.')
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'heroku-credential-acceptance-'))
const parsedRoot = path.parse(tempRoot).root
const environment = {
  ...process.env,
  CI: 'true',
  NATIVE_CREDENTIAL_ACCEPTANCE: 'true',
  CREDENTIAL_ACCEPTANCE_TEMP_ROOT: tempRoot,
  ...(process.platform === 'darwin' ? {CFFIXED_USER_HOME: tempRoot} : {}),
  HOME: tempRoot,
  USERPROFILE: tempRoot,
  HOMEDRIVE: process.platform === 'win32' ? parsedRoot.replace(/[/\\]$/, '') : parsedRoot,
  HOMEPATH: tempRoot.slice(process.platform === 'win32' ? parsedRoot.length - 1 : parsedRoot.length) || path.sep,
}

const mocha = path.join(repositoryRoot, 'node_modules', 'mocha', 'bin', 'mocha.js')
const acceptanceTest = path.join(repositoryRoot, 'test', 'acceptance', 'credential-manager.acceptance.test.ts')
const keychainPath = path.join(tempRoot, 'acceptance.keychain-db')
const keychainPassword = 'heroku-credential-manager-acceptance'

function security(...arguments_) {
  return execFileSync('security', arguments_, {
    encoding: 'utf8',
    env: environment,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

function setupMacOSKeychain() {
  fs.mkdirSync(path.join(tempRoot, 'Library', 'Preferences'), {recursive: true})
  fs.mkdirSync(path.join(tempRoot, 'Library', 'Keychains'), {recursive: true})
  security('create-keychain', '-p', keychainPassword, keychainPath)
  security('set-keychain-settings', '-lut', '21600', keychainPath)
  security('unlock-keychain', '-p', keychainPassword, keychainPath)
  security('list-keychains', '-d', 'user', '-s', keychainPath)
  security('default-keychain', '-d', 'user', '-s', keychainPath)

  const searchList = security('list-keychains', '-d', 'user')
  const defaultKeychain = security('default-keychain', '-d', 'user')
  if (!searchList.includes(keychainPath) || !defaultKeychain.includes(keychainPath)) {
    throw new Error('Failed to configure the isolated acceptance keychain')
  }
}

let result
try {
  if (process.platform === 'darwin') setupMacOSKeychain()

  result = spawnSync(
    process.execPath,
    ['--loader', 'ts-node/esm', mocha, '--no-config', '--reporter', 'spec', '--timeout', '30000', acceptanceTest],
    {cwd: repositoryRoot, env: environment, stdio: 'inherit'},
  )
} finally {
  if (process.platform === 'darwin' && fs.existsSync(keychainPath)) {
    try {
      security('delete-keychain', keychainPath)
    } catch {
      // The isolated CI home is removed below even if Keychain cleanup fails.
    }
  }

  fs.rmSync(tempRoot, {force: true, recursive: true})
}

if (result.error) throw result.error
if (result.status !== 0) process.exitCode = result.status ?? 1
