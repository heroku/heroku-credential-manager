import {expect} from 'chai'

import {NetrcPostCommitError} from '../src/index.js'

describe('NetrcPostCommitError', function () {
  it('exposes stable post-commit failure details from the package root', function () {
    const cause = new Error('lock ownership was lost')
    const error = new NetrcPostCommitError('Netrc lock release failed after commit', {cause})

    expect(error).to.be.instanceOf(Error)
    expect(error.name).to.equal('NetrcPostCommitError')
    expect(error.message).to.equal('Netrc lock release failed after commit')
    expect(error.code).to.equal('NETRC_POST_COMMIT_FAILURE')
    expect(error.committed).to.equal(true)
    expect(error.cause).to.equal(cause)
  })
})
