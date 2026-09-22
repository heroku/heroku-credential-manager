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
const loginTypesDirectory = path.join(temporaryRoot, 'login-types-consumer')
const isolatedHome = path.join(temporaryRoot, 'home')
const forbiddenDependencies = new Set([
  '@heroku-cli/command',
  '@heroku/heroku-cli-util',
  '@heroku/heroku-fetch',
  '@heroku/http-call',
  '@heroku/sdk',
  '@heroku/types',
  '@oclif/core',
  'inquirer',
  'ky',
  'node-fetch',
  'open',
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
      HOMEDRIVE: root.slice(0, 2),
      HOMEPATH: home.slice(2) || path.sep,
      USERPROFILE: home,
    }
  }

  return {
    HOME: home,
    HOMEDRIVE: root,
    HOMEPATH: home.slice(root.length),
    USERPROFILE: home,
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
  fs.mkdirSync(loginTypesDirectory)
  fs.mkdirSync(isolatedHome)

  const packOutput = npm(
    packageRoot,
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
  assert.deepEqual(Object.keys(installedPackage.exports).sort(), ['.', './login', './package.json'])
  const graphSize = assertSafeDistGraph(installedPackageRoot)

  const dependencyTree = JSON.parse(npm(consumerDirectory, 'ls', '--omit=dev', '--all', '--json'))
  assertProductionDependencies(dependencyTree)

  fs.writeFileSync(path.join(loginTypesDirectory, 'package.json'), JSON.stringify({
    name: 'packed-login-types-consumer',
    private: true,
    type: 'module',
  }, null, 2))
  npm(loginTypesDirectory, 'install', '--ignore-scripts', '--no-audit', '--no-fund', tarball, 'typescript@^5.9.3')
  fs.writeFileSync(path.join(loginTypesDirectory, 'login-only.ts'), `
import type {LoginTimers} from '${packageName}/login'

const handle = {}
const timers: LoginTimers = {
  clearTimeout(timer) { void timer },
  setTimeout(handler, timeoutMs) { void [handler, timeoutMs]; return handle },
}
void timers
`)
  fs.writeFileSync(path.join(loginTypesDirectory, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      lib: ['ES2022', 'DOM'],
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      noEmit: true,
      strict: true,
      target: 'ES2022',
      types: [],
    },
    include: ['login-only.ts'],
  }, null, 2))
  assert.equal(fs.existsSync(path.join(loginTypesDirectory, 'node_modules', '@types', 'node')), false)
  execFileSync(process.execPath, [path.join(loginTypesDirectory, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json'], {
    cwd: loginTypesDirectory,
    stdio: 'inherit',
  })

  npm(consumerDirectory, 'install', '--save-dev', '--ignore-scripts', '--no-audit', '--no-fund', 'typescript@^5.9.3', '@types/node@^22.15.3')

  fs.writeFileSync(path.join(consumerDirectory, 'type-imports.ts'), `
import type {AuthEntry, KeychainAuthEntry, NetrcAuthEntry, StorageConfig} from '${packageName}'
import {getAuth, NativeCredentialNotFoundError, removeAuth, saveAuth} from '${packageName}'
import type {
  LoginBrowser,
  LoginConfig,
  LoginEnvironment,
  LoginHttp,
  LoginHttpRequest,
  LoginHttpResponse,
  LoginMethod,
  LoginOptions,
  LoginOutput,
  LoginProgress,
  LoginPrompt,
  LoginPromptSelection,
  LoginResult,
  LoginStorage,
  LoginTimers,
} from '${packageName}/login'
import {Login, LoginCancelledError, LoginHttpError} from '${packageName}/login'

const auth: AuthEntry = {account: 'package-fixture@example.com', token: 'package-fixture-token'}
const keychain: KeychainAuthEntry = {account: auth.account, service: 'package-fixture', token: auth.token}
const netrc: NetrcAuthEntry = {login: keychain.account, password: keychain.token}
const storage: StorageConfig = {credentialStore: null, useNetrc: true}
const method: LoginMethod = 'browser'
const options: LoginOptions = {method}
const result: LoginResult = auth
const config: LoginConfig = {apiUrl: 'https://api.heroku.com', credentialService: 'package-fixture-service'}
const request: LoginHttpRequest = {method: 'GET'}
const response: LoginHttpResponse<unknown> = {body: {}, headers: {}, ok: true, status: 200}
const selection: LoginPromptSelection = {cancelled: 'quit'}
const http: LoginHttp = {async request<T>() { return response as LoginHttpResponse<T> }}
const prompt: LoginPrompt = {
  async accessToken() { return 'token' },
  async email() { return 'package-fixture@example.com' },
  async loginMethod() { return {method: 'browser'} },
  async organization() { return 'org' },
  async password() { return 'password' },
  async secondFactor() { return '123456' },
}
const browser: LoginBrowser = {async open() {}}
const output: LoginOutput = {warn() {}, write() {}}
const progress: LoginProgress = {start() {}, stop() {}}
const environment: LoginEnvironment = {get() { return undefined }}
const timers: LoginTimers = {
  clearTimeout() {},
  setTimeout() { return {} },
}
const loginStorage: LoginStorage = {
  async deleteLoginState() {},
  async getAuth(account, host, service) { void [account, host, service]; return auth },
  hasNativeStorage() { return false },
  async readLoginState() { return undefined },
  async removeAuth(account, hosts, service, expectedToken) { void [account, hosts, service, expectedToken] },
  async saveAuth(account, token, hosts, service) { void [account, token, hosts, service] },
  async writeLoginState() {},
}
const login = new Login({browser, config, environment, http, output, progress, prompt})
void login.logout(auth)
// @ts-expect-error logout requires the credential entry to remove
void login.logout()
const cancelled = new LoginCancelledError('quit')
const httpError = new LoginHttpError(401, {id: 'unauthorized'})

void [auth, browser, cancelled, config, environment, getAuth, http, httpError, keychain, login, loginStorage, method,
  NativeCredentialNotFoundError, netrc, options, output, progress, prompt, removeAuth, request, response, result,
  saveAuth, selection, storage, timers]
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
import * as loginModule from '${packageName}/login'

assert.equal(typeof credentialManager.saveAuth, 'function')
assert.equal(typeof credentialManager.getAuth, 'function')
assert.equal(typeof credentialManager.NativeCredentialNotFoundError, 'function')
assert.equal(typeof credentialManager.removeAuth, 'function')
const missingCredentialError = new credentialManager.NativeCredentialNotFoundError('Token not found')
assert.equal(missingCredentialError.name, 'NativeCredentialNotFoundError')
assert.equal(missingCredentialError.message, 'Token not found')
assert.equal(typeof loginModule.Login, 'function')
assert.equal(typeof loginModule.LoginCancelledError, 'function')
assert.equal(typeof loginModule.LoginHttpError, 'function')
const fakeHttp = {async request() { throw new Error('not executed') }}
const fakePrompt = {
  async accessToken() { return 'unused' },
  async email() { return 'unused@example.com' },
  async loginMethod() { return {cancelled: 'quit'} },
  async organization() { return 'unused' },
  async password() { return 'unused' },
  async secondFactor() { return 'unused' },
}
const fakeStorage = {
  async deleteLoginState() {},
  async getAuth(account, host, service) { void [account, host, service]; throw new Error('not executed') },
  hasNativeStorage() { return false },
  async readLoginState() {},
  async removeAuth(account, hosts, service, expectedToken) { void [account, hosts, service, expectedToken] },
  async saveAuth(account, token, hosts, service) { void [account, token, hosts, service] },
  async writeLoginState() {},
}
const login = new loginModule.Login({http: fakeHttp, prompt: fakePrompt, storage: fakeStorage})
assert.equal(login instanceof loginModule.Login, true)

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

const dataDir = path.join(temporaryRoot, 'login-data')
const staleAccount = 'stale-native@example.com'
const netrcAccount = 'netrc-prefill@example.com'
const loginToken = 'packed-login-token'
await credentialManager.writeLoginState(dataDir, staleAccount)
await credentialManager.saveAuth(netrcAccount, 'old-netrc-token', ['api.heroku.com'])
let previousAccount
const packedPrompt = {
  async accessToken() { return 'unused' },
  async email(previous) { previousAccount = previous; return netrcAccount },
  async loginMethod() { return {method: 'browser'} },
  async organization() { return 'unused' },
  async password() { return 'packed-password' },
  async secondFactor() { return 'unused' },
}
const packedHttp = {
  async request(url, options) {
    if (options.method === 'POST' && url.endsWith('/oauth/authorizations')) {
      return {
        body: {access_token: {token: loginToken}, user: {email: netrcAccount}},
        headers: {},
        ok: true,
        status: 200,
      }
    }

    if (options.method === 'DELETE' && url.endsWith('/oauth/sessions/~')) {
      return {body: {id: 'not_found', resource: 'session'}, headers: {}, ok: false, status: 404}
    }

    if (options.method === 'GET' && url.endsWith('/oauth/authorizations')) {
      return {body: {id: 'unauthorized'}, headers: {}, ok: false, status: 401}
    }

    throw new Error(\`Unexpected packed login request: \${options.method} \${url}\`)
  },
}
const packedLogin = new loginModule.Login({
  config: {dataDir},
  http: packedHttp,
  prompt: packedPrompt,
})
const packedAuth = await packedLogin.login({method: 'interactive'})
assert.equal(previousAccount, netrcAccount)
assert.deepEqual(packedAuth, {account: netrcAccount, token: loginToken})
assert.deepEqual(await credentialManager.readLoginState(dataDir), {account: staleAccount})
assert.deepEqual(await credentialManager.getAuth(netrcAccount, 'api.heroku.com'), packedAuth)
await packedLogin.logout(packedAuth)
await assert.rejects(credentialManager.getAuth(undefined, 'api.heroku.com'), /No auth found|No credentials found/)
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
