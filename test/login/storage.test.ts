import {expect} from 'chai'

import {getNativeCredentialStore, getStorageConfig} from '../../src/index.js'
import {defaultLoginStorage} from '../../src/login/storage.js'

describe('defaultLoginStorage', function () {
  let originalNetrcWrite: string | undefined

  beforeEach(function () {
    originalNetrcWrite = process.env.HEROKU_NETRC_WRITE
  })

  afterEach(function () {
    if (originalNetrcWrite === undefined) delete process.env.HEROKU_NETRC_WRITE
    else process.env.HEROKU_NETRC_WRITE = originalNetrcWrite
  })

  it('does not report native storage when forced netrc mode is active', function () {
    process.env.HEROKU_NETRC_WRITE = 'true'
    expect(getStorageConfig().credentialStore).to.equal(null)
    expect(defaultLoginStorage.hasNativeStorage()).to.equal(false)
  })

  it('reports native storage when it is actively selected', function () {
    delete process.env.HEROKU_NETRC_WRITE
    if (!getNativeCredentialStore()) this.skip()
    expect(getStorageConfig().credentialStore).to.equal(getNativeCredentialStore())
    expect(defaultLoginStorage.hasNativeStorage()).to.equal(true)
  })

  it('exposes forwarding signatures for service-isolated conditional operations', function () {
    expect(defaultLoginStorage.getAuth).to.have.length(3)
    expect(defaultLoginStorage.saveAuth).to.have.length(4)
    expect(defaultLoginStorage.removeAuth).to.have.length(4)
  })
})
