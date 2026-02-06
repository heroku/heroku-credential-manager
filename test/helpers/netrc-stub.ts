import {type SinonStub, stub} from 'sinon'

import {Netrc} from '../../src/lib/netrc-parser.js'

/**
 * Mock netrc object used to simulate a parsed .netrc file with test credentials.
 */
const mockNetrc = {
  machines: {
    'api.heroku.com': {
      login: 'test@example.com',
      password: 'mypass',
    },
  },
  saveSync: stub(),
}

let loadSyncStub: SinonStub | undefined
let loadStub: SinonStub | undefined

/**
 * Stubs the Netrc prototype's `loadSync` and `load` methods to return mock credentials.
 * This prevents tests from reading the actual .netrc file on disk.
 * Safe to call multiple times; will not re-stub if already stubbed.
 * @returns {void}
 */
export function stubNetrc() {
  // Only stub if not already stubbed
  if (!loadSyncStub) {
    loadSyncStub = stub(Netrc.prototype, 'loadSync').callsFake(function (this: Netrc) {
      Object.assign(this, mockNetrc)
    })
  }

  if (!loadStub) {
    loadStub = stub(Netrc.prototype, 'load').callsFake(function (this: Netrc) {
      Object.assign(this, mockNetrc)
      return Promise.resolve()
    }) as SinonStub
  }
}

/**
 * Restores the original `loadSync` and `load` methods on the Netrc prototype.
 * Should be called in test teardown to clean up stubs.
 * @returns {void}
 */
export function restoreNetrcStub() {
  if (loadSyncStub) {
    loadSyncStub.restore()
    loadSyncStub = undefined
  }

  if (loadStub) {
    loadStub.restore()
    loadStub = undefined
  }
}
