import debug from 'debug'

import type {NetrcAuthEntry} from '../lib/types.js'

import {Netrc} from '../lib/netrc-parser.js'

const credDebug = debug('heroku-credential-manager')

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

    if (changed) await this.netrc.save()
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

    await this.netrc.load()
    for (const host of hosts) {
      this.applyAuthToHost(auth, host)
    }

    await this.netrc.save()
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
}
