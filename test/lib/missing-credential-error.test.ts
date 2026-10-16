import {expect} from 'chai'

import {isMissingCredentialError, MissingCredentialError} from '../../src/lib/missing-credential-error.js'
import {NativeCredentialNotFoundError} from '../../src/native-credential-not-found-error.js'

describe('isMissingCredentialError', function () {
  it('recognizes MissingCredentialError', function () {
    expect(isMissingCredentialError(new MissingCredentialError('No auth found'))).to.be.true
  })

  it('recognizes NativeCredentialNotFoundError', function () {
    expect(isMissingCredentialError(new NativeCredentialNotFoundError('not found'))).to.be.true
  })

  it('recognizes the bare "No auth found" message', function () {
    expect(isMissingCredentialError(new Error('No auth found'))).to.be.true
  })

  it('recognizes host-scoped "No auth found for <host>"', function () {
    expect(isMissingCredentialError(new Error('No auth found for api.heroku.com'))).to.be.true
    expect(isMissingCredentialError(new Error('No auth found for api.staging.herokudev.com'))).to.be.true
  })

  it('recognizes the netrc account-mismatch message', function () {
    expect(isMissingCredentialError(new Error('Netrc credential does not match the requested account for host'))).to.be.true
  })

  it('does not match unrelated errors', function () {
    expect(isMissingCredentialError(new Error('network down'))).to.be.false
    expect(isMissingCredentialError(new Error('No auth'))).to.be.false
  })

  it('does not match non-Error values', function () {
    expect(isMissingCredentialError('No auth found')).to.be.false
    expect(isMissingCredentialError(42)).to.be.false
    expect(isMissingCredentialError(null)).to.be.false
    expect(isMissingCredentialError({message: 'No auth found'})).to.be.false
  })
})
