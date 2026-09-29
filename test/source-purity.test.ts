import {expect} from 'chai'
import fs from 'node:fs'
import path from 'node:path'

const forbiddenRootPatterns = [
  ['account selector', /account-selector/],
  ['browser opener', /(?:from|import)\s+["']open["']/],
  ['Heroku fetch', /heroku-fetch/],
  ['inquirer', /(?:from|import)\s+["']inquirer["']/],
  ['login implementation', /(?:from|import)\s+["'](?![^"']*login-state\.js["'])[^"']*login[^"']*["']/],
  ['telemetry', /telemetry|sentry/i],
] as const

const forbiddenLoginPatterns = [
  ['browser package', /(?:from|import)\s*\(?["'](?:open|playwright|puppeteer)["']/],
  ['command package', /@heroku(?:-cli)?\/(?:command|heroku-cli-util)/],
  ['Heroku client package', /@heroku\/(?:heroku-fetch|sdk|types)/],
  ['Heroku fetch', /heroku-fetch/],
  ['HTTP call', /@heroku\/http-call/],
  ['inquirer', /(?:from|import)\s+["']inquirer["']/],
  ['oclif', /@oclif\//],
  ['reporting or telemetry', /reporter|telemetry|sentry/i],
  ['schema or types package', /@heroku\/(?:schema|types)/],
] as const

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(file) : (entry.name.endsWith('.ts') ? [file] : [])
  })
}

describe('source purity', function () {
  let sourceRoot: string

  before(function () {
    sourceRoot = path.resolve('src')
  })

  it('does not contain command-only account selection, prompting, login, browser, or telemetry imports', function () {
    const sources = sourceFiles(sourceRoot)
      .filter(file => !file.startsWith(path.join(sourceRoot, 'login') + path.sep))
      .map(file => ({content: fs.readFileSync(file, 'utf8'), file}))

    for (const [name, pattern] of forbiddenRootPatterns) {
      const matches = sources.filter(({content}) => pattern.test(content)).map(({file}) => path.relative(sourceRoot, file))
      expect(matches, `${name} must remain outside the storage package`).to.deep.equal([])
    }
  })

  it('keeps the isolated login subpath free of command, client, browser, schema, and telemetry dependencies', function () {
    const loginRoot = path.join(sourceRoot, 'login')
    const sources = sourceFiles(loginRoot).map(file => ({content: fs.readFileSync(file, 'utf8'), file}))

    for (const [name, pattern] of forbiddenLoginPatterns) {
      const matches = sources.filter(({content}) => pattern.test(content)).map(({file}) => path.relative(loginRoot, file))
      expect(matches, `${name} must remain outside the login subpath`).to.deep.equal([])
    }
  })

  it('does not expose login from the package root', function () {
    const rootSource = fs.readFileSync(path.join(sourceRoot, 'index.ts'), 'utf8')
    expect(rootSource).to.not.match(/(?:from|import)\s+["'][^"']*login(?:\/index)?\.js["']/)
  })

  it('does not retain the generic LoginHttp source contract', function () {
    const legacyContract = /\b(?:FetchLoginHttp|LoginHttp(?:Request|Response)?)\b/
    const matches = sourceFiles(path.join(sourceRoot, 'login'))
      .filter(file => legacyContract.test(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(sourceRoot, file))
    expect(matches).to.deep.equal([])
  })

  it('has no account-selector source file', function () {
    expect(fs.existsSync(path.join(sourceRoot, 'lib', 'account-selector.ts'))).to.be.false
  })
})
