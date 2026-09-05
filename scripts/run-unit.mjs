import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'heroku-credential-manager-unit-'))
const isolatedHome = path.join(temporaryRoot, 'home')

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

try {
  fs.mkdirSync(isolatedHome)

  const arguments_ = process.argv.slice(2)
  const pattern = process.env.npm_config_file || 'test/**/*.test.ts'
  const ignoredPatterns = process.env.npm_config_file ? [] : [
    '--ignore',
    'test/acceptance/**',
  ]
  const loader = path.join(packageRoot, 'node_modules', 'ts-node', 'esm.mjs')
  const nodeOptions = process.versions.node.split('.').map(Number)[0] >= 22
    ? [process.env.NODE_OPTIONS, '--no-experimental-require-module'].filter(Boolean).join(' ')
    : process.env.NODE_OPTIONS
  const result = spawnSync(process.execPath, [
    path.join(packageRoot, 'node_modules', 'c8', 'bin', 'c8.js'),
    process.execPath,
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
    ...arguments_,
    pattern,
  ], {
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
    process.exitCode = 1
  } else {
    process.exitCode = result.status ?? 1
  }
} finally {
  fs.rmSync(temporaryRoot, {force: true, recursive: true})
}
