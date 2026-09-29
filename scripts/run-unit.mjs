import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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

const arguments_ = process.argv.slice(2)
// `--watch` is a local-only interactive loop; `--coverage` (or COVERAGE=1) wraps the
// run in c8. Neither flag is forwarded to mocha. Everything else passes straight through.
const watchMode = arguments_.includes('--watch')
const withCoverage = process.env.COVERAGE === '1' || arguments_.includes('--coverage')
const forwardedArguments = arguments_.filter(argument => argument !== '--coverage' && argument !== '--watch')
const pattern = process.env.npm_config_file || 'test/**/*.test.ts'
const ignoredPatterns = process.env.npm_config_file
  ? []
  : [
    '--ignore',
    'test/acceptance/**',
  ]
const loader = pathToFileURL(path.join(packageRoot, 'node_modules', 'ts-node', 'esm.mjs')).href
const nodeOptions = process.versions.node.split('.').map(Number)[0] >= 22
  ? [process.env.NODE_OPTIONS, '--no-experimental-require-module'].filter(Boolean).join(' ')
  : process.env.NODE_OPTIONS

// Run the full mocha suite once in a throwaway HOME so tests never touch the real
// user's credential store. Returns the child's exit code.
function runOnce() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'heroku-credential-manager-unit-'))
  const isolatedHome = path.join(temporaryRoot, 'home')

  try {
    fs.mkdirSync(isolatedHome)

    const nodeMocha = [
      '--loader',
      loader,
      path.join(packageRoot, 'node_modules', 'mocha', 'bin', 'mocha.js'),
      '--no-config',
      '--require',
      './test/hooks.ts',
      '--reporter',
      'spec',
      '--timeout',
      '15000',
      ...ignoredPatterns,
      ...forwardedArguments,
      pattern,
    ]
    const command = withCoverage
      ? [path.join(packageRoot, 'node_modules', 'c8', 'bin', 'c8.js'), process.execPath, ...nodeMocha]
      : nodeMocha
    const result = spawnSync(process.execPath, command, {
      cwd: packageRoot,
      env: {
        ...process.env,
        ...homeEnvironment(isolatedHome),
        TS_NODE_PROJECT: path.join(packageRoot, 'test', 'tsconfig.json'),
        ...(nodeOptions ? {NODE_OPTIONS: nodeOptions} : {}),
      },
      stdio: 'inherit',
    })

    if (result.error) throw result.error
    if (result.signal) {
      console.error(`Unit tests terminated by ${result.signal}.`)
      return 1
    }

    return result.status ?? 1
  } finally {
    fs.rmSync(temporaryRoot, {force: true, recursive: true})
  }
}

if (watchMode) {
  // mocha's own `--watch` re-loads test files via require(), which is incompatible
  // with this package's ESM + ts-node loader (ERR_REQUIRE_ESM). Drive the watch loop
  // ourselves instead: re-run the proven one-shot invocation on any source/test change.
  const watchedDirectories = ['src', 'test']
    .map(directory => path.join(packageRoot, directory))
    .filter(directory => fs.existsSync(directory))
  let running = false
  let rerunQueued = false

  const runAndReport = () => {
    if (running) {
      rerunQueued = true
      return
    }

    running = true
    console.clear()
    try {
      runOnce()
    } catch (error) {
      console.error(error)
    }

    running = false
    if (rerunQueued) {
      rerunQueued = false
      runAndReport()
    } else {
      console.log('\nWatching for changes… (press Ctrl-C to exit)')
    }
  }

  let debounceTimer
  for (const directory of watchedDirectories) {
    fs.watch(directory, {recursive: true}, (_event, filename) => {
      if (filename && !/\.(ts|mjs|json)$/.test(filename.toString())) return
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(runAndReport, 150)
    })
  }

  runAndReport()
} else {
  process.exitCode = runOnce()
}
