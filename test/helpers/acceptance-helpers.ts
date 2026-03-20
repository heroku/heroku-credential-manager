import childProcess from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Skip the current suite or test unless ACCEPTANCE_TESTS=true.
 */
export function skipUnlessAcceptanceEnv(context: Mocha.Context): void {
  const value = process.env.ACCEPTANCE_TESTS?.toLowerCase()
  if (value !== 'true') {
    context.skip()
  }
}

/**
 * True if the current platform is macOS (darwin).
 */
export function isMacOS(): boolean {
  return process.platform === 'darwin'
}

/**
 * True if the current platform is Windows.
 */
export function isWindows(): boolean {
  return process.platform === 'win32'
}

/**
 * True if the current platform is Linux and secret-tool is available.
 */
export function isLinuxWithSecretTool(): boolean {
  if (process.platform !== 'linux') {
    return false
  }

  try {
    childProcess.execSync('which secret-tool', {stdio: 'ignore'})
    return true
  } catch {
    return false
  }
}

/**
 * True if the current OS has a native credential store we can run acceptance tests against.
 */
export function hasNativeCredentialStore(): boolean {
  return isMacOS() || isWindows() || isLinuxWithSecretTool()
}
