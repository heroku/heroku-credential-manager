import {expect} from 'chai'
import fs from 'node:fs'
import path from 'node:path'

const forbiddenSourcePatterns = [
  ['account selector', /account-selector/],
  ['browser opener', /(?:from|import)\s+["']open["']/],
  ['Heroku fetch', /heroku-fetch/],
  ['inquirer', /(?:from|import)\s+["']inquirer["']/],
  ['login implementation', /(?:from|import)\s+["'](?![^"']*login-state\.js["'])[^"']*login[^"']*["']/],
  ['telemetry', /telemetry|sentry/i],
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
      .map(file => ({content: fs.readFileSync(file, 'utf8'), file}))

    for (const [name, pattern] of forbiddenSourcePatterns) {
      const matches = sources.filter(({content}) => pattern.test(content)).map(({file}) => path.relative(sourceRoot, file))
      expect(matches, `${name} must remain outside the storage package`).to.deep.equal([])
    }
  })

  it('has no account-selector source file', function () {
    expect(fs.existsSync(path.join(sourceRoot, 'lib', 'account-selector.ts'))).to.be.false
  })
})
