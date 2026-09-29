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

function declarationFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? declarationFiles(file) : (entry.name.endsWith('.d.ts') ? [file] : [])
  })
}

function assertLoginDeclarationSurface(installedPackageRoot) {
  const loginDistRoot = path.join(installedPackageRoot, 'dist', 'login')
  const declarations = declarationFiles(loginDistRoot).map(file => ({
    content: fs.readFileSync(file, 'utf8'),
    file: path.relative(loginDistRoot, file),
  }))
  assert(declarations.length > 0, 'packed login entry point does not contain declarations')
  const declarationSource = declarations.map(({content}) => content).join('\n')
  const requiredDeclarations = [
    ['FetchLike', /\b(?:interface|type)\s+FetchLike\b/],
    ['HerokuApiClientLike', /\b(?:interface|type)\s+HerokuApiClientLike\b/],
    ['LoginRequestError', /\b(?:declare\s+)?class\s+LoginRequestError\b/],
    ['LoginDependencies.apiClientForToken', /\bLoginDependencies\s*=\s*\{[^}]*\bapiClientForToken\b/s],
  ]
  const forbiddenDeclarations = [
    ['legacy LoginHttp contract', /\bLoginHttp\w*\b/],
    ['legacy fetch adapter', /\bFetchLoginHttp\b/],
    ['generic request contract', /\brequest\s*<[^>]+>\s*\(/],
    ['@heroku/heroku-fetch coupling', /(?:@heroku\/)?heroku-fetch/i],
  ]

  for (const [name, pattern] of requiredDeclarations) {
    assert.match(declarationSource, pattern, `packed login declarations do not expose ${name}`)
  }

  for (const [name, pattern] of forbiddenDeclarations) {
    const matches = declarations.filter(({content}) => pattern.test(content)).map(({file}) => file)
    assert.deepEqual(matches, [], `${name} found in packed login declarations: ${matches.join(', ')}`)
  }
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
  assert.deepEqual(Object.keys(installedPackage.exports['.']), ['types', 'default'])
  assert.deepEqual(Object.keys(installedPackage.exports['./login']), ['types', 'default'])
  assert.equal(installedPackage.publishConfig.access, 'restricted')
  const graphSize = assertSafeDistGraph(installedPackageRoot)
  assertLoginDeclarationSurface(installedPackageRoot)

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
  FetchLike,
  HerokuApiClientLike,
  HerokuApiRequestOptions,
  HerokuApiResponse,
  LoginBrowser,
  LoginConfig,
  LoginEnvironment,
  LoginDependencies,
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
import {Login, LoginCancelledError, LoginRequestError} from '${packageName}/login'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2) ? true : false
type Expect<Value extends true> = Value
type ExpectedHerokuApiClient = {
  delete<T>(path: string, options?: HerokuApiRequestOptions): Promise<HerokuApiResponse<T>>
  get<T>(path: string, options?: HerokuApiRequestOptions): Promise<HerokuApiResponse<T>>
}
type _HerokuApiClientContract = Expect<Equal<HerokuApiClientLike, ExpectedHerokuApiClient>>

const auth: AuthEntry = {account: 'package-fixture@example.com', token: 'package-fixture-token'}
const keychain: KeychainAuthEntry = {account: auth.account, service: 'package-fixture', token: auth.token}
const netrc: NetrcAuthEntry = {login: keychain.account, password: keychain.token}
const storage: StorageConfig = {credentialStore: null, useNetrc: true}
const method: LoginMethod = 'browser'
const options: LoginOptions = {method}
const result: LoginResult = auth
const config: LoginConfig = {apiUrl: 'https://api.heroku.com', credentialService: 'package-fixture-service'}
const selection: LoginPromptSelection = {cancelled: 'quit'}
const fetchLike: FetchLike = fetch
const apiClient: HerokuApiClientLike = {
  async delete<T>() { return {body: undefined as T, headers: {}, status: 204} },
  async get<T>() { return {body: undefined as T, headers: {}, status: 200} },
}
const dependencies: LoginDependencies = {apiClientForToken: () => apiClient, fetch: fetchLike}
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
const login = new Login({...dependencies, browser, config, environment, output, progress, prompt})
void login.logout(auth)
// @ts-expect-error logout requires the credential entry to remove
void login.logout()
const cancelled = new LoginCancelledError('quit')
const requestError = new LoginRequestError(401, {id: 'unauthorized'})

void [apiClient, auth, browser, cancelled, config, dependencies, environment, fetchLike, getAuth, keychain, login, loginStorage, method,
  NativeCredentialNotFoundError, netrc, options, output, progress, prompt, removeAuth, requestError, result,
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
import os from 'node:os'
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
assert.equal(typeof loginModule.LoginRequestError, 'function')
assert.equal(loginModule.LoginRequestError.prototype instanceof Error, true)

const ambientTokenA = 'ambient-token-a'
const operationTokenB = 'operation-token-b'
const account = 'package-fixture@example.com'
const apiCalls = []
const ambientApiCalls = []
const ambientApi = {
  async delete(path, options) { ambientApiCalls.push({method: 'DELETE', options, path}); throw new Error('ambient client used') },
  async get(path, options) { ambientApiCalls.push({method: 'GET', options, path}); throw new Error('ambient client used') },
}
const operationApi = {
  async delete(path, options) {
    apiCalls.push({method: 'DELETE', options, path})
    return {body: undefined, headers: {}, status: 204}
  },
  async get(path, options) {
    apiCalls.push({method: 'GET', options, path})
    if (path === '/oauth/authorizations' && options?.headers?.Range === undefined) {
      return {
        body: [{access_token: {token: operationTokenB}, id: 'operation-authorization'}],
        headers: {'nExT-rAnGe': 'id ..; cursor="operation-b"'},
        status: 206,
      }
    }

    if (path === '/oauth/authorizations' && options?.headers?.Range === 'id ..; cursor="operation-b"') {
      return {body: [], headers: {}, status: 200}
    }

    if (path === '/oauth/authorizations/~') {
      return {body: {access_token: {token: 'default-token'}}, headers: {}, status: 200}
    }

    throw new Error(\`unexpected Platform API GET \${path}\`)
  },
}
assert.deepEqual(Object.keys(operationApi).sort(), ['delete', 'get'])
assert.equal(operationApi.request, undefined)

const factoryTokens = []
const apiClientForToken = token => {
  factoryTokens.push(token)
  if (token === operationTokenB) return operationApi
  if (token === ambientTokenA) return ambientApi
  throw new Error(\`unexpected API client token: \${token}\`)
}
const prompt = {
  async accessToken() { return 'unused' },
  async email() { return account },
  async loginMethod() { return {method: 'interactive'} },
  async organization() { return 'unused' },
  async password() { return 'package-fixture-password' },
  async secondFactor() { return 'unused' },
}
const storageCalls = []
const storage = {
  async deleteLoginState() {},
  async getAuth(account, host, service) { void [account, host, service]; throw new Error('no previous credential') },
  hasNativeStorage() { return false },
  async readLoginState() {},
  async removeAuth(account, hosts, service, expectedToken) { storageCalls.push({account, expectedToken, hosts, operation: 'remove', service}) },
  async saveAuth(account, token, hosts, service) { storageCalls.push({account, hosts, operation: 'save', service, token}) },
  async writeLoginState() {},
}
const fetchCalls = []
const injectedFetch = async (url, init) => {
  fetchCalls.push({init, url: String(url)})
  return new Response(JSON.stringify({
    access_token: {token: operationTokenB},
    user: {email: account},
  }), {
    headers: {'content-type': 'application/json'},
    status: 201,
  })
}
const login = new loginModule.Login({
  apiClientForToken,
  config: {requestTimeoutMs: 4321},
  fetch: injectedFetch,
  prompt,
  storage,
})
assert.equal(login instanceof loginModule.Login, true)
const auth = await login.login({method: 'interactive'})
assert.deepEqual(auth, {account, token: operationTokenB})
assert.equal(fetchCalls.length, 1)
assert.equal(fetchCalls[0].url, 'https://api.heroku.com/oauth/authorizations')
assert.equal(fetchCalls[0].init.method, 'POST')
assert.equal(fetchCalls[0].init.redirect, 'error')
assert.equal(fetchCalls[0].init.signal instanceof AbortSignal, true)
assert.equal(fetchCalls[0].init.headers.accept, 'application/vnd.heroku+json; version=3')
assert.equal(fetchCalls[0].init.headers['content-type'], 'application/json')
assert.match(fetchCalls[0].init.headers.authorization, /^Basic /)
assert.deepEqual(JSON.parse(fetchCalls[0].init.body), {
  description: \`Heroku CLI login from \${os.hostname()}\`,
  expires_in: 2_592_000,
  scope: ['global'],
})

await login.logout({account, token: operationTokenB})
assert.deepEqual(factoryTokens, [operationTokenB])
assert.deepEqual(ambientApiCalls, [])
assert.equal(fetchCalls.length, 1)
assert.deepEqual(apiCalls.map(({method, path}) => [method, path]), [
  ['DELETE', '/oauth/sessions/~'],
  ['GET', '/oauth/authorizations'],
  ['GET', '/oauth/authorizations'],
  ['GET', '/oauth/authorizations/~'],
  ['DELETE', '/oauth/authorizations/operation-authorization'],
])
const operationSignal = apiCalls[0].options.signal
assert.equal(operationSignal instanceof AbortSignal, true)
assert.equal(apiCalls.every(({options}) => options.signal === operationSignal), true)
assert.equal(apiCalls.every(({options}) => options.timeoutMs === 4321), true)
assert.deepEqual(apiCalls.map(({options}) => options.headers), [
  undefined,
  {},
  {Range: 'id ..; cursor="operation-b"'},
  undefined,
  undefined,
])
assert.deepEqual(storageCalls, [
  {account, hosts: ['api.heroku.com', 'git.heroku.com'], operation: 'save', service: 'heroku-cli', token: operationTokenB},
  {account, expectedToken: operationTokenB, hosts: ['api.heroku.com', 'git.heroku.com'], operation: 'remove', service: 'heroku-cli'},
])

const temporaryRoot = ${JSON.stringify(temporaryRoot)}
const expectedHome = ${JSON.stringify(isolatedHome)}
const netrcPath = path.join(expectedHome, process.platform === 'win32' ? '_netrc' : '.netrc')
assert.equal(process.env.HOME, expectedHome)
assert.equal(process.env.USERPROFILE, expectedHome)
assert.equal(path.join(process.env.HOMEDRIVE, process.env.HOMEPATH), expectedHome)
assert.equal(path.relative(temporaryRoot, netrcPath).startsWith('..'), false)

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
