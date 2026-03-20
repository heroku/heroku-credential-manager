import {expect} from 'chai'

import {hasNativeCredentialStore, skipUnlessAcceptanceEnv} from '../helpers/acceptance-helpers.js'

describe('acceptance smoke tests', function () {
  before(function () {
    skipUnlessAcceptanceEnv(this)
  })

  it('runs when credential store is available', function () {
    if (!hasNativeCredentialStore()) {
      this.skip()
    }

    expect(true).to.be.true
  })
})
