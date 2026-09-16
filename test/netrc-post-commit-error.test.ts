import {expect} from 'chai'

import {
  NetrcPostCommitError, type NetrcPostCommitOperation, isNetrcPostCommitError,
} from '../src/index.js'

describe('NetrcPostCommitError', function () {
  it('exposes stable post-commit failure details from the package root', function () {
    const cause = new Error('lock ownership was lost')
    const error = new NetrcPostCommitError('Netrc lock release failed after commit', {cause})

    expect(error).to.be.instanceOf(Error)
    expect(error.name).to.equal('NetrcPostCommitError')
    expect(error.message).to.equal('Netrc lock release failed after commit')
    expect(error.code).to.equal('NETRC_POST_COMMIT_FAILURE')
    expect(error.committed).to.equal(true)
    expect(error.operation).to.equal(undefined)
    expect(error.cause).to.equal(cause)
  })

  it('exposes optional operation context', function () {
    const operations: NetrcPostCommitOperation[] = ['save', 'remove', 'stale-cleanup']

    for (const operation of operations) {
      const error = new NetrcPostCommitError('Post-commit failure', {operation})
      expect(error.operation).to.equal(operation)
      expect(isNetrcPostCommitError(error)).to.equal(true)
    }
  })

  it('structurally identifies valid markers without relying on class identity', function () {
    expect(isNetrcPostCommitError({
      code: 'NETRC_POST_COMMIT_FAILURE',
      committed: true,
      operation: 'save',
    })).to.equal(true)
    expect(isNetrcPostCommitError({code: 'NETRC_POST_COMMIT_FAILURE', committed: true})).to.equal(true)
  })

  it('reads structural marker properties only once', function () {
    const reads = new Map<string, number>()
    const marker = Object.create(null) as Record<string, unknown>
    for (const [property, value] of [
      ['code', 'NETRC_POST_COMMIT_FAILURE'],
      ['committed', true],
      ['operation', 'remove'],
    ] as const) {
      Object.defineProperty(marker, property, {
        get() {
          reads.set(property, (reads.get(property) ?? 0) + 1)
          return value
        },
      })
    }

    expect(isNetrcPostCommitError(marker)).to.equal(true)
    expect(Object.fromEntries(reads)).to.deep.equal({code: 1, committed: 1, operation: 1})
  })

  it('safely rejects invalid and hostile marker candidates', function () {
    const hostile = Object.create(null) as Record<string, unknown>
    Object.defineProperty(hostile, 'code', {
      get() {
        throw new Error('blocked')
      },
    })

    for (const candidate of [
      undefined,
      null,
      new Error('ordinary'),
      {code: 'NETRC_POST_COMMIT_FAILURE', committed: false},
      {code: 'NETRC_POST_COMMIT_FAILURE', committed: true, operation: 'unknown'},
      hostile,
    ]) expect(isNetrcPostCommitError(candidate)).to.equal(false)
  })
})
