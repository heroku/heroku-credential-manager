import {expect} from 'chai'

import {resolveEnvAuth} from '../../src/lib/env-auth.js'

describe('resolveEnvAuth', function () {
  it('returns the HEROKU_API_KEY token with no warning', function () {
    expect(resolveEnvAuth({HEROKU_API_KEY: 'key-token'})).to.deep.equal({token: 'key-token', warning: undefined})
  })

  it('warns and returns no token when HEROKU_API_TOKEN is set without HEROKU_API_KEY', function () {
    expect(resolveEnvAuth({HEROKU_API_TOKEN: 'tok'})).to.deep.equal({
      token: undefined,
      warning: {
        code: 'HEROKU_API_TOKEN_WITHOUT_KEY',
        message: 'HEROKU_API_TOKEN is set but you probably meant HEROKU_API_KEY',
      },
    })
  })

  it('lets HEROKU_API_KEY win without warning when both are set', function () {
    expect(resolveEnvAuth({HEROKU_API_KEY: 'key', HEROKU_API_TOKEN: 'tok'})).to.deep.equal({
      token: 'key',
      warning: undefined,
    })
  })

  it('treats an empty HEROKU_API_KEY as unset', function () {
    expect(resolveEnvAuth({HEROKU_API_KEY: ''})).to.deep.equal({token: undefined, warning: undefined})
  })

  it('returns nothing when neither variable is set', function () {
    expect(resolveEnvAuth({})).to.deep.equal({token: undefined, warning: undefined})
  })
})
