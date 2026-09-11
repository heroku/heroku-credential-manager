import {expect, use} from 'chai'
import chaiAsPromised from 'chai-as-promised'
import fs from 'fs-extra'
import {resolve} from 'node:path'

import {type MachineToken, parse} from '../../src/lib/netrc-parser.js'

use(chaiAsPromised)

import {NetrcHandler} from '../../src/credential-handlers/netrc-handler.js'
import {restoreNetrcStub, stubNetrc} from '../helpers/netrc-stub.js'

describe('NetrcHandler', function () {
  beforeEach(stubNetrc)

  afterEach(restoreNetrcStub)

  describe('get auth', function () {
    it('should get auth for a specified host', async function () {
      const handler = new NetrcHandler()
      const auth = await handler.getAuth('api.heroku.com')
      expect(auth).to.deep.equal({login: 'test@example.com', password: 'mypass'})
    })

    it('should error if no auth is saved for the specified host', async function () {
      const handler = new NetrcHandler()
      await expect(handler.getAuth('fake.heroku.com')).to.be.rejectedWith('No auth found for fake.heroku.com')
    })
  })

  describe('remove auth', function () {
    it('should remove auth for a specified host', async function () {
      const handler = new NetrcHandler()
      await handler.removeAuth('api.heroku.com')
      expect(handler.netrc.machines['api.heroku.com']).to.be.undefined
    })

    it('should do nothing if no auth is saved for the specified host', async function () {
      const handler = new NetrcHandler()
      await handler.removeAuth('fake.heroku.com')
      expect(handler.netrc.machines['fake.heroku.com']).to.be.undefined
    })
  })

  describe('save auth', function () {
    it('should save auth for a specified host', async function () {
      const handler = new NetrcHandler()
      await handler.saveAuth({login: 'test@example.com', password: 'mypass'}, 'new.heroku.com')
      expect(handler.netrc.machines['new.heroku.com']).to.deep.equal({login: 'test@example.com', password: 'mypass'})
    })

    it('should remove method and org entries for the specified host if present', async function () {
      const handler = new NetrcHandler()
      await handler.saveAuth({login: 'test@example.com', password: 'mypass'}, 'api.heroku.com')
      handler.netrc.machines['api.heroku.com'].method = 'gpg'
      handler.netrc.machines['api.heroku.com'].org = 'test'
      await handler.saveAuth({login: 'test@example.com', password: 'mypass'}, 'api.heroku.com')
      expect(handler.netrc.machines['api.heroku.com']).to.deep.equal({login: 'test@example.com', password: 'mypass'})
      expect(handler.netrc.machines['api.heroku.com'].method).to.be.undefined
      expect(handler.netrc.machines['api.heroku.com'].org).to.be.undefined
    })

    it('adds internal-whitespace value if _tokens array is present for specified host', async function () {
      const handler = new NetrcHandler()
      await handler.saveAuth({login: 'test@example.com', password: 'mypass'}, 'api.heroku.com')
      handler.netrc.machines._tokens = [{host: 'api.heroku.com', props: {}, type: 'machine'}] as MachineToken[]
      await handler.saveAuth({login: 'test@example.com', password: 'mypass'}, 'api.heroku.com')
      expect((handler.netrc.machines._tokens[0] as MachineToken).internalWhitespace).to.equal('\n  ')
    })
  })

  describe('batch netrc (temp file, no prototype stub)', function () {
    let tmpDir: string
    let netrcPath: string

    beforeEach(async function () {
      tmpDir = resolve('tmp/netrc-handler-batch')
      await fs.mkdirp(tmpDir)
      netrcPath = resolve(tmpDir, `n-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      await fs.writeFile(netrcPath, '', 'utf8')
    })

    afterEach(async function () {
      await fs.remove(tmpDir)
    })

    it('saveAuthForHosts writes multiple hosts with a single save', async function () {
      let loadCalls = 0
      let saveCalls = 0
      const handler = new NetrcHandler(netrcPath)
      const origLoad = handler.netrc.load.bind(handler.netrc)
      const origSave = handler.netrc.save.bind(handler.netrc)
      handler.netrc.load = async () => {
        loadCalls++
        return origLoad()
      }

      handler.netrc.save = async () => {
        saveCalls++
        return origSave()
      }

      await handler.saveAuthForHosts({login: 'u@e.com', password: 'tok'}, ['a.com', 'b.com'])
      expect(loadCalls).to.equal(1)
      expect(saveCalls).to.equal(1)
      expect(handler.netrc.machines['a.com']).to.deep.equal({login: 'u@e.com', password: 'tok'})
      expect(handler.netrc.machines['b.com']).to.deep.equal({login: 'u@e.com', password: 'tok'})
    })

    for (const hosts of [[], [''], ['   '], ['a.com', '']]) {
      it(`saveAuthForHosts rejects invalid hosts ${JSON.stringify(hosts)} before loading netrc`, async function () {
        let loadCalls = 0
        const handler = new NetrcHandler(netrcPath)
        handler.netrc.load = async () => {
          loadCalls++
        }

        await expect(handler.saveAuthForHosts({login: 'u@e.com', password: 'tok'}, hosts))
          .to.be.rejectedWith(Error, 'Cannot save credentials to netrc: provide at least one valid, non-empty host')
        expect(loadCalls).to.equal(0)
        expect(handler.netrc.machines?.['']).to.be.undefined
      })
    }

    it('removeAuthForHosts removes only supplied hosts with an exactly matching login using one load and save', async function () {
      let loadCalls = 0
      let saveCalls = 0
      const handler = new NetrcHandler(netrcPath)
      handler.netrc.load = async () => {
        loadCalls++
        handler.netrc.machines = parse(`machine api.heroku.com login u@e.com password api-token
machine git.heroku.com login u@e.com password git-token
machine other.heroku.com login other@e.com password other-token
machine unsupplied.heroku.com login u@e.com password unsupplied-token
`)
      }

      handler.netrc.save = async () => {
        saveCalls++
      }

      await handler.removeAuthForHosts(['api.heroku.com', 'git.heroku.com', 'other.heroku.com', 'api.heroku.com'], 'u@e.com')
      expect(loadCalls).to.equal(1)
      expect(saveCalls).to.equal(1)
      expect(handler.netrc.machines['api.heroku.com']).to.be.undefined
      expect(handler.netrc.machines['git.heroku.com']).to.be.undefined
      expect(handler.netrc.machines['other.heroku.com'].login).to.equal('other@e.com')
      expect(handler.netrc.machines['unsupplied.heroku.com'].login).to.equal('u@e.com')
    })

    it('removeAuthForHosts preserves entries with different or missing logins without saving', async function () {
      let loadCalls = 0
      let saveCalls = 0
      const handler = new NetrcHandler(netrcPath)
      handler.netrc.load = async () => {
        loadCalls++
        handler.netrc.machines = parse(`machine different.heroku.com login other@e.com password other-token
machine case.heroku.com login U@E.COM password case-token
machine missing.heroku.com password missing-login-token
`)
      }

      handler.netrc.save = async () => {
        saveCalls++
      }

      await handler.removeAuthForHosts(['different.heroku.com', 'case.heroku.com', 'missing.heroku.com', 'absent.heroku.com'], 'u@e.com')
      expect(loadCalls).to.equal(1)
      expect(saveCalls).to.equal(0)
      expect(handler.netrc.machines['different.heroku.com'].login).to.equal('other@e.com')
      expect(handler.netrc.machines['case.heroku.com'].login).to.equal('U@E.COM')
      expect(handler.netrc.machines['missing.heroku.com'].login).to.be.undefined
    })

    it('removeAuthForHosts preserves a matching account with a different password', async function () {
      let saveCalls = 0
      const handler = new NetrcHandler(netrcPath)
      handler.netrc.load = async () => {
        handler.netrc.machines = parse('machine api.heroku.com login u@e.com password newer-token\n')
      }

      handler.netrc.save = async () => {
        saveCalls++
      }

      await handler.removeAuthForHosts(['api.heroku.com'], 'u@e.com', 'older-token')
      expect(saveCalls).to.equal(0)
      expect(handler.netrc.machines['api.heroku.com']).to.deep.equal({login: 'u@e.com', password: 'newer-token'})
    })

    it('removeAuthForHosts removes an entry matching both account and password', async function () {
      let saveCalls = 0
      const handler = new NetrcHandler(netrcPath)
      handler.netrc.load = async () => {
        handler.netrc.machines = parse('machine api.heroku.com login u@e.com password token\n')
      }

      handler.netrc.save = async () => {
        saveCalls++
      }

      await handler.removeAuthForHosts(['api.heroku.com'], 'u@e.com', 'token')
      expect(saveCalls).to.equal(1)
      expect(handler.netrc.machines['api.heroku.com']).to.be.undefined
    })

    it('removeAuthForHosts supports password-only conditional removal', async function () {
      const handler = new NetrcHandler(netrcPath)
      handler.netrc.load = async () => {
        handler.netrc.machines = parse(`machine matching.heroku.com login first@e.com password token
machine different.heroku.com login second@e.com password newer-token
`)
      }

      handler.netrc.save = async () => {}

      await handler.removeAuthForHosts(['matching.heroku.com', 'different.heroku.com'], undefined, 'token')
      expect(handler.netrc.machines['matching.heroku.com']).to.be.undefined
      expect(handler.netrc.machines['different.heroku.com']).to.deep.equal({login: 'second@e.com', password: 'newer-token'})
    })

    it('removeAuthForHosts remains unconditional when account and password are undefined', async function () {
      const handler = new NetrcHandler(netrcPath)
      handler.netrc.load = async () => {
        handler.netrc.machines = parse('machine api.heroku.com login any@e.com password any-token\n')
      }

      handler.netrc.save = async () => {}

      await handler.removeAuthForHosts(['api.heroku.com'])
      expect(handler.netrc.machines['api.heroku.com']).to.be.undefined
    })

    for (const hosts of [[''], ['   '], ['a.com', 'bad host'], ['bad\0host']]) {
      it(`removeAuthForHosts rejects invalid hosts ${JSON.stringify(hosts)} before loading netrc`, async function () {
        let loadCalls = 0
        const handler = new NetrcHandler(netrcPath)
        handler.netrc.load = async () => {
          loadCalls++
        }

        await expect(handler.removeAuthForHosts(hosts, 'u@e.com'))
          .to.be.rejectedWith(Error, 'Cannot remove credentials from netrc: provide at least one valid, non-empty host')
        expect(loadCalls).to.equal(0)
      })
    }

    it('removeAuthForHosts does not load or save for an empty host list', async function () {
      let loadCalls = 0
      let saveCalls = 0
      const handler = new NetrcHandler(netrcPath)
      handler.netrc.load = async () => {
        loadCalls++
      }

      handler.netrc.save = async () => {
        saveCalls++
      }

      await handler.removeAuthForHosts([], 'u@e.com')
      expect(loadCalls).to.equal(0)
      expect(saveCalls).to.equal(0)
    })
  })
})
