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

  it('reports the native backend independently of forced netrc mode', function () {
    if (!getNativeCredentialStore()) this.skip()
    process.env.HEROKU_NETRC_WRITE = 'true'
    expect(getStorageConfig().credentialStore).to.equal(null)
    expect(defaultLoginStorage.hasNativeStorage()).to.equal(true)
  })
})
