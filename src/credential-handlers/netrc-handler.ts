import debug from 'debug'
import {randomUUID} from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import {setTimeout as delay} from 'node:timers/promises'

import type {NetrcAuthEntry} from '../lib/types.js'

import {Netrc} from '../lib/netrc-parser.js'
import {NetrcPostCommitError} from '../netrc-post-commit-error.js'

const credDebug = debug('heroku-credential-manager')
const lockPollMs = 50
const lockTimeoutMs = 10_000
const activeNonces = new Set<string>()
const processStartedAt = Date.now() - (process.uptime() * 1000)

type LockOwner = {
  createdAt: number
  hostname: string
  nonce: string
  pid: number
  processStartedAt?: number
}

type FileIdentity = {
  birthtimeMs: number
  dev: number
  ino: number
  mode: number
}

type LockObservation = {
  identity: FileIdentity
  owner: LockOwner
  ownerIdentity: FileIdentity
}

type MutationLock = {
  assertOwned(): Promise<void>
  release(): Promise<void>
}

function noFollowFlag(): number {
  return process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW ?? 0
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function identity(stats: fs.Stats): FileIdentity {
  return {
    birthtimeMs: stats.birthtimeMs, dev: stats.dev, ino: stats.ino, mode: stats.mode,
  }
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  if (left.ino !== 0 || right.ino !== 0) return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
  return left.birthtimeMs === right.birthtimeMs && left.mode === right.mode
}

function validOwner(value: Partial<LockOwner>, now = Date.now()): value is LockOwner {
  return Number.isFinite(value.createdAt)
    && value.createdAt! > 0
    && value.createdAt! <= now + 60_000
    && typeof value.hostname === 'string'
    && value.hostname.length > 0
    && value.hostname.length <= 255
    && !value.hostname.includes('\0')
    && typeof value.nonce === 'string'
    && value.nonce.length > 0
    && value.nonce.length <= 255
    && !value.nonce.includes('\0')
    && Number.isSafeInteger(value.pid)
    && value.pid! > 0
    && (value.processStartedAt === undefined
      || (Number.isFinite(value.processStartedAt) && value.processStartedAt! > 0 && value.processStartedAt! <= now + 60_000))
}

async function readLockOwner(lockPath: string): Promise<LockObservation> {
  const lockStats = await fs.promises.lstat(lockPath)
  if (lockStats.isSymbolicLink()) throw new Error(`Refusing to use symlinked netrc lock: ${lockPath}`)
  if (!lockStats.isFile()) throw new Error(`Refusing to use non-file netrc lock: ${lockPath}`)

  let handle: fs.promises.FileHandle | undefined
  try {
    // eslint-disable-next-line no-bitwise
    handle = await fs.promises.open(lockPath, fs.constants.O_RDONLY | noFollowFlag())
    const stats = await handle.stat()
    if (!stats.isFile()) throw new Error(`Refusing to read non-regular netrc lock owner: ${lockPath}`)
    if (stats.size > 4096) throw new Error(`Invalid netrc lock owner metadata: ${lockPath}`)
    let parsed: Partial<LockOwner>
    try {
      parsed = JSON.parse(await handle.readFile('utf8')) as Partial<LockOwner>
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      throw new Error(`Invalid netrc lock owner metadata: ${lockPath}`, {cause: error})
    }

    if (!validOwner(parsed)) throw new Error(`Invalid netrc lock owner metadata: ${lockPath}`)
    return {
      identity: identity(lockStats), owner: parsed, ownerIdentity: identity(stats),
    }
  } finally {
    await handle?.close()
  }
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !isFileSystemError(error, 'ESRCH')
  }
}

function lockCanBeReclaimed(observed: LockObservation): boolean {
  const {owner} = observed
  if (owner.hostname !== os.hostname()) return false
  // Another copy of this module may own the same-process lock.
  if (owner.pid === process.pid) return false

  // A live PID may be the owner or a reused PID. In either case it is not safe to steal.
  return !processIsRunning(owner.pid)
}

async function restoreQuarantinedLock(quarantinePath: string, lockPath: string): Promise<void> {
  try {
    await fs.promises.link(quarantinePath, lockPath)
    await fs.promises.unlink(quarantinePath)
  } catch {
    // Never replace another owner while restoring an object that did not match the observation.
    // A uniquely named quarantine is safer to leave behind when the canonical path is occupied.
  }
}

async function quarantineObservedLock(
  lockPath: string,
  observed: LockObservation,
): Promise<boolean> {
  let current: LockObservation
  try {
    current = await readLockOwner(lockPath)
  } catch (error) {
    if (isFileSystemError(error, 'ENOENT')) return false
    throw error
  }

  if (!sameIdentity(current.identity, observed.identity)
    || !sameIdentity(current.ownerIdentity, observed.ownerIdentity)
    || current.owner.nonce !== observed.owner.nonce) return false

  const quarantinePath = `${lockPath}.quarantine.${process.pid}.${randomUUID()}`
  try {
    await fs.promises.rename(lockPath, quarantinePath)
  } catch (error) {
    if (isFileSystemError(error, 'ENOENT')) return false
    throw error
  }

  const quarantined = await readLockOwner(quarantinePath)
  if (!sameIdentity(quarantined.identity, observed.identity)
    || !sameIdentity(quarantined.ownerIdentity, observed.ownerIdentity)
    || quarantined.owner.nonce !== observed.owner.nonce) {
    await restoreQuarantinedLock(quarantinePath, lockPath)
    return false
  }

  await fs.promises.unlink(quarantinePath)
  return true
}

async function cleanUpPublishedLock(lockPath: string, nonce: string): Promise<void> {
  const observed = await readLockOwner(lockPath)
  if (observed.owner.nonce === nonce) await quarantineObservedLock(lockPath, observed)
}

// Lock acquisition necessarily coordinates publication, cleanup, contention, and stale recovery.
// eslint-disable-next-line complexity
async function acquireLock(file: string): Promise<MutationLock> {
  const lockPath = `${file}.lock`
  const startedAt = Date.now()
  // A hard link publishes complete owner metadata and claims the canonical path in one atomic,
  // no-replace operation. Cooperating contenders never replace a registered owner based on age.
  /* eslint-disable no-await-in-loop, no-constant-condition */
  while (true) {
    const owner: LockOwner = {
      createdAt: Date.now(),
      hostname: os.hostname(),
      nonce: randomUUID(),
      pid: process.pid,
      processStartedAt,
    }
    const candidatePath = `${lockPath}.owner.${process.pid}.${owner.nonce}.tmp`
    let ownerHandle: fs.promises.FileHandle | undefined
    let candidateCreated = false
    let candidateCloseAttempted = false
    let acquired: LockObservation | undefined
    let published = false
    let contended = false
    const failures: unknown[] = []
    try {
      // eslint-disable-next-line no-bitwise
      ownerHandle = await fs.promises.open(candidatePath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | noFollowFlag(), 0o600)
      candidateCreated = true
      await ownerHandle.writeFile(JSON.stringify(owner))
      await ownerHandle.sync()
      candidateCloseAttempted = true
      await ownerHandle.close()
      ownerHandle = undefined
      try {
        await fs.promises.link(candidatePath, lockPath)
        published = true
        activeNonces.add(owner.nonce)
      } catch (error) {
        if (isFileSystemError(error, 'EEXIST')) contended = true
        else throw error
      }

      if (published) {
        acquired = await readLockOwner(lockPath)
        if (acquired.owner.nonce !== owner.nonce) {
          throw new Error(`Netrc lock ownership was compromised during acquisition: ${lockPath}`)
        }
      }
    } catch (error) {
      failures.push(error)
    }

    if (ownerHandle) {
      try {
        await ownerHandle.close()
      } catch (error) {
        failures.push(error)
        if (!candidateCloseAttempted) {
          // eslint-disable-next-line max-depth
          try {
            await ownerHandle.close()
          } catch (retryError) {
            failures.push(retryError)
          }
        }
      }
    }

    if (candidateCreated) {
      try {
        await fs.promises.unlink(candidatePath)
      } catch (error) {
        if (!isFileSystemError(error, 'ENOENT')) failures.push(error)
      }
    }

    if (published && failures.length > 0) {
      activeNonces.delete(owner.nonce)
      try {
        await cleanUpPublishedLock(lockPath, owner.nonce)
      } catch (error) {
        failures.push(error)
      }
    }

    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Failed to initialize and clean up netrc lock', {cause: failures[0]})
    }

    if (acquired) {
      const assertOwned = async () => {
        const current = await readLockOwner(lockPath)
        if (!sameIdentity(current.identity, acquired.identity)
          || !sameIdentity(current.ownerIdentity, acquired.ownerIdentity)
          || current.owner.nonce !== owner.nonce
          || !activeNonces.has(owner.nonce)) {
          throw new Error(`Netrc lock ownership was lost: ${lockPath}`)
        }
      }

      let released = false
      return {
        assertOwned,
        async release() {
          if (released) return
          released = true
          try {
            const removed = await quarantineObservedLock(lockPath, acquired)
            if (!removed) throw new Error(`Netrc lock ownership was lost before release: ${lockPath}`)
          } finally {
            activeNonces.delete(owner.nonce)
          }
        },
      }
    }

    if (!contended) throw new Error(`Netrc lock acquisition failed without an error: ${lockPath}`)

    let observed: LockObservation
    try {
      observed = await readLockOwner(lockPath)
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) continue
      throw error
    }

    if (lockCanBeReclaimed(observed) && await quarantineObservedLock(lockPath, observed)) continue

    if (Date.now() - startedAt >= lockTimeoutMs) {
      throw new Error(`Timed out waiting for netrc lock: ${lockPath}`)
    }

    await delay(lockPollMs + Math.floor(Math.random() * lockPollMs))
  }
  /* eslint-enable no-await-in-loop, no-constant-condition */
}

export class NetrcHandler {
  public readonly netrc: Netrc

  /** @param file - Optional netrc path; otherwise uses the default location. */
  constructor(file?: string) {
    this.netrc = new Netrc(file)
  }

  /**
   * Retrieves authentication credentials for a given host.
   * @param host - The hostname to retrieve credentials for.
   * @returns The authentication entry for the host.
   * @throws An error when no credentials exist for the host.
   */
  public async getAuth(host: string) {
    await this.netrc.load()
    const auth = this.netrc.machines[host]
    if (!auth) {
      throw new Error(`No auth found for ${host}`)
    }

    return auth
  }

  /**
   * Removes authentication credentials for a given host.
   * @param host - The hostname to remove credentials for.
   * @param account - Optional login that existing credentials must exactly match.
   * @param expectedPassword - Optional password that existing credentials must exactly match.
   * @returns A promise that resolves when removal is complete.
   */
  public async removeAuth(host: string, account?: string, expectedPassword?: string) {
    await this.removeAuthForHosts([host], account, expectedPassword)
  }

  /**
   * Removes credentials for multiple hosts with a single netrc load/save.
   * Only entries matching every supplied condition are removed.
   * @param hosts - The hostnames to remove credentials for.
   * @param account - Optional login that existing credentials must exactly match.
   * @param expectedPassword - Optional password that existing credentials must exactly match.
   * @returns A promise that resolves when removal is complete.
   */
  public async removeAuthForHosts(hosts: string[], account?: string, expectedPassword?: string) {
    if (hosts.length === 0) return
    this.validateHosts(hosts, 'remove')
    await this.withMutationLock(async assertOwned => {
      await this.netrc.load()
      let changed = false
      for (const host of hosts) {
        const machine = this.netrc.machines[host]
        if (!machine
          || (account !== undefined && machine.login !== account)
          || (expectedPassword !== undefined && machine.password !== expectedPassword)) {
          credDebug(`No credentials to logout for ${host}`)
          continue
        }

        delete this.netrc.machines[host]
        changed = true
      }

      if (changed) await this.netrc.save(assertOwned)
      return changed
    })
  }

  /**
   * Saves authentication credentials for a given host.
   * @param auth - The authentication entry to save.
   * @param host - The hostname to save credentials for.
   * @returns A promise that resolves when the credentials are saved.
   */
  public async saveAuth(auth: NetrcAuthEntry, host: string) {
    await this.saveAuthForHosts(auth, [host])
  }

  /**
   * Saves the same credentials for multiple hosts with a single netrc load/save.
   * @param auth - The authentication entry to save.
   * @param hosts - The hostnames to save credentials for.
   * @returns A promise that resolves when the credentials are saved.
   */
  public async saveAuthForHosts(auth: NetrcAuthEntry, hosts: string[]) {
    this.validateHosts(hosts, 'save', true)

    await this.withMutationLock(async assertOwned => {
      await this.netrc.load()
      for (const host of hosts) {
        this.applyAuthToHost(auth, host)
      }

      await this.netrc.save(assertOwned)
      return true
    })
  }

  private applyAuthToHost(auth: NetrcAuthEntry, host: string) {
    if (!this.netrc.machines[host]) this.netrc.machines[host] = {}
    this.netrc.machines[host] = {
      login: auth.login,
      password: auth.password,
    }
    delete this.netrc.machines[host].method
    delete this.netrc.machines[host].org

    if (this.netrc.machines._tokens) {
      for (const token of this.netrc.machines._tokens) {
        if (token.type === 'machine' && host === token.host) {
          token.internalWhitespace = '\n  '
        }
      }
    }
  }

  private validateHosts(hosts: string[], operation: 'remove' | 'save', requireHost = false) {
    if ((requireHost && hosts.length === 0) || hosts.some(host => typeof host !== 'string' || host.length === 0 || /[\s\0]/.test(host))) {
      const preposition = operation === 'save' ? 'to' : 'from'
      throw new Error(`Cannot ${operation} credentials ${preposition} netrc: provide at least one valid, non-empty host`)
    }
  }

  private async validateNetrcTarget(): Promise<void> {
    try {
      const stats = await fs.promises.lstat(this.netrc.file)
      if (!stats.isFile()) throw new Error(`Refusing to mutate non-regular netrc file: ${this.netrc.file}`)
    } catch (error) {
      if (!isFileSystemError(error, 'ENOENT')) throw error
    }
  }

  private async withMutationLock(operation: (assertOwned: () => Promise<void>) => Promise<boolean>): Promise<void> {
    const lock = await acquireLock(this.netrc.file)
    let committed = false
    let operationFailure: unknown
    let operationFailed = false
    try {
      await this.validateNetrcTarget()
      committed = await operation(() => lock.assertOwned())
    } catch (error) {
      operationFailed = true
      operationFailure = error
    }

    try {
      await lock.release()
    } catch (releaseError) {
      if (!operationFailed) {
        if (committed) throw new NetrcPostCommitError('Netrc mutation committed but lock release failed', {cause: releaseError})
        throw releaseError
      }

      throw new AggregateError([operationFailure, releaseError], 'Netrc mutation failed and lock release also failed', {
        cause: operationFailure,
      })
    }

    if (operationFailed) throw operationFailure
  }
}
