import {spawnSync} from 'node:child_process'
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
  HOME: tempRoot,
  USERPROFILE: tempRoot,
  HOMEDRIVE: process.platform === 'win32' ? parsedRoot.replace(/[/\\]$/, '') : parsedRoot,
  HOMEPATH: tempRoot.slice(process.platform === 'win32' ? parsedRoot.length - 1 : parsedRoot.length) || path.sep,
}

const mocha = path.join(repositoryRoot, 'node_modules', 'mocha', 'bin', 'mocha.js')
const acceptanceTest = path.join(repositoryRoot, 'test', 'acceptance', 'credential-manager.acceptance.test.ts')

let result
try {
  result = spawnSync(
    process.execPath,
    ['--loader', 'ts-node/esm', mocha, '--no-config', '--reporter', 'spec', '--timeout', '30000', acceptanceTest],
    {cwd: repositoryRoot, env: environment, stdio: 'inherit'},
  )
} finally {
  fs.rmSync(tempRoot, {force: true, recursive: true})
}

if (result.error) throw result.error
if (result.status !== 0) process.exitCode = result.status ?? 1
