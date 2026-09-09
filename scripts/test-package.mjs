import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const packageName = '@heroku/heroku-credential-manager'
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'heroku-credential-manager-package-'))
const packDirectory = path.join(temporaryRoot, 'pack')
const consumerDirectory = path.join(temporaryRoot, 'consumer')
const isolatedHome = path.join(temporaryRoot, 'home')
const forbiddenDependencies = new Set([
  'inquirer',
  'open',
  '@heroku-cli/command',
  '@heroku/heroku-cli-util',
  '@oclif/core',
  '@heroku/http-call',
  '@heroku/heroku-fetch',
  'node-fetch',
  '@heroku/sdk',
  '@heroku/types',
  'ky',
  'undici',
])

function npm(cwd, ...arguments_) {
  const npmCli = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].find(candidate => candidate && fs.existsSync(candidate))
  assert(npmCli, 'Unable to locate the npm CLI used for package verification')

  return execFileSync(process.execPath, [npmCli, ...arguments_], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...homeEnvironment(isolatedHome),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

function homeEnvironment(home) {
  const {root} = path.parse(home)

  if (process.platform === 'win32') {
    return {
      HOME: home,
      USERPROFILE: home,
      HOMEDRIVE: root.slice(0, 2),
      HOMEPATH: home.slice(2) || path.sep,
    }
  }

  return {
    HOME: home,
    USERPROFILE: home,
    HOMEDRIVE: root,
    HOMEPATH: home.slice(root.length),
  }
}

function assertSafeDistGraph(installedPackageRoot) {
  const distRoot = path.join(installedPackageRoot, 'dist')
  const realDistRoot = fs.realpathSync(distRoot)
  const entrypoint = path.join(distRoot, 'index.js')
  const visited = new Set()
  const importPattern = /\b(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

  function visit(file) {
    const resolvedFile = fs.realpathSync(file)
    const relativeFile = path.relative(realDistRoot, resolvedFile)
    assert(
      relativeFile !== '..' && !relativeFile.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeFile),
      `dist import escaped the package dist directory: ${file}`,
    )
    assert(!/(^|[/\\])login(?:[/\\.]|$)/.test(relativeFile), `dist/login is reachable from dist/index.js: ${relativeFile}`)

    if (visited.has(resolvedFile)) return
    visited.add(resolvedFile)

    const source = fs.readFileSync(resolvedFile, 'utf8')
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] || match[2]
      if (!specifier.startsWith('.')) continue

      const importedFile = path.resolve(path.dirname(resolvedFile), specifier)
      const relativeImport = path.relative(realDistRoot, importedFile)
      assert(
        relativeImport && !relativeImport.startsWith('..') && !path.isAbsolute(relativeImport),
        `dist import escaped the package dist directory: ${relativeFile} -> ${specifier}`,
      )
      assert(fs.existsSync(importedFile), `dist import does not exist: ${relativeFile} -> ${specifier}`)
      visit(importedFile)
    }
  }

  visit(entrypoint)
  return visited.size
}

function assertProductionDependencies(tree) {
  const foundForbidden = new Set()

  function visit(dependencies = {}) {
    for (const [name, dependency] of Object.entries(dependencies)) {
      if (forbiddenDependencies.has(name)) {
        foundForbidden.add(name)
      }

      visit(dependency.dependencies)
    }
  }

  visit(tree.dependencies)
  assert.deepEqual([...foundForbidden], [], `forbidden production dependencies found: ${[...foundForbidden].join(', ')}`)
}

try {
  fs.mkdirSync(packDirectory)
  fs.mkdirSync(consumerDirectory)
  fs.mkdirSync(isolatedHome)

  const packOutput = npm(packageRoot,
    'pack',
    '--ignore-scripts',
    '--json',
    '--pack-destination',
    packDirectory,
  )
  const [{filename}] = JSON.parse(packOutput)
  const tarball = path.join(packDirectory, filename)

  fs.writeFileSync(path.join(consumerDirectory, 'package.json'), JSON.stringify({
    name: 'packed-tarball-consumer',
    private: true,
    type: 'module',
  }, null, 2))
  npm(consumerDirectory, 'install', '--ignore-scripts', '--no-audit', '--no-fund', tarball)

  const installedPackageRoot = path.join(consumerDirectory, 'node_modules', ...packageName.split('/'))
  const installedPackage = JSON.parse(fs.readFileSync(path.join(installedPackageRoot, 'package.json'), 'utf8'))
  assert.deepEqual(Object.keys(installedPackage.exports).sort(), ['.', './package.json'])
  assert.equal(installedPackage.exports['./login'], undefined)
  const graphSize = assertSafeDistGraph(installedPackageRoot)

  const dependencyTree = JSON.parse(npm(consumerDirectory, 'ls', '--omit=dev', '--all', '--json'))
  assertProductionDependencies(dependencyTree)

  npm(consumerDirectory, 'install', '--save-dev', '--ignore-scripts', '--no-audit', '--no-fund', 'typescript@^5.9.3', '@types/node@^22.15.3')

  fs.writeFileSync(path.join(consumerDirectory, 'type-imports.ts'), `
import type {AuthEntry, KeychainAuthEntry, NetrcAuthEntry, StorageConfig} from '${packageName}'
import {getAuth, removeAuth, saveAuth} from '${packageName}'

const auth: AuthEntry = {account: 'package-fixture@example.com', token: 'package-fixture-token'}
const keychain: KeychainAuthEntry = {account: auth.account, service: 'package-fixture', token: auth.token}
const netrc: NetrcAuthEntry = {login: keychain.account, password: keychain.token}
const storage: StorageConfig = {credentialStore: null, useNetrc: true}

void [auth, keychain, netrc, storage, getAuth, removeAuth, saveAuth]
`)
  fs.writeFileSync(path.join(consumerDirectory, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      noEmit: true,
      strict: true,
      target: 'ES2022',
    },
    include: ['type-imports.ts'],
  }, null, 2))
  execFileSync(process.execPath, [path.join(consumerDirectory, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json'], {
    cwd: consumerDirectory,
    stdio: 'inherit',
  })

  fs.writeFileSync(path.join(consumerDirectory, 'runtime.mjs'), `
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import * as credentialManager from '${packageName}'

assert.equal(typeof credentialManager.saveAuth, 'function')
assert.equal(typeof credentialManager.getAuth, 'function')
assert.equal(typeof credentialManager.removeAuth, 'function')
await assert.rejects(import('${packageName}/login'), error => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED')

const temporaryRoot = ${JSON.stringify(temporaryRoot)}
const expectedHome = ${JSON.stringify(isolatedHome)}
const netrcPath = path.join(expectedHome, process.platform === 'win32' ? '_netrc' : '.netrc')
assert.equal(process.env.HOME, expectedHome)
assert.equal(process.env.USERPROFILE, expectedHome)
assert.equal(path.join(process.env.HOMEDRIVE, process.env.HOMEPATH), expectedHome)
assert.equal(path.relative(temporaryRoot, netrcPath).startsWith('..'), false)

const account = 'package-fixture@example.com'
const host = 'package-fixture.heroku.com'
const token = 'package-fixture-token'
await credentialManager.saveAuth(account, token, [host])
assert.equal(fs.existsSync(netrcPath), true)
assert.equal(path.relative(temporaryRoot, netrcPath).startsWith('..'), false)
assert.deepEqual(await credentialManager.getAuth(account, host), {account, token})
await credentialManager.removeAuth(account, [host])
await assert.rejects(credentialManager.getAuth(account, host), /No auth found|No credentials found/)
`)
  execFileSync(process.execPath, ['runtime.mjs'], {
    cwd: consumerDirectory,
    env: {
      ...process.env,
      HEROKU_NETRC_WRITE: 'true',
      ...homeEnvironment(isolatedHome),
    },
    stdio: 'inherit',
  })

  console.log(`Verified packed tarball ${filename} in an isolated consumer (${graphSize} reachable dist files; netrc under ${temporaryRoot}).`)
} finally {
  fs.rmSync(temporaryRoot, {force: true, recursive: true})
}
