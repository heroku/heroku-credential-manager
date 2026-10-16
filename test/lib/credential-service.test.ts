import {expect} from 'chai'

import {credentialServiceForHost, DEFAULT_API_HOST, DEFAULT_CREDENTIAL_SERVICE} from '../../src/lib/credential-service.js'

describe('credentialServiceForHost', function () {
  it('uses the bare default service for the production API host', function () {
    expect(credentialServiceForHost('api.heroku.com')).to.equal('heroku-cli')
    expect(credentialServiceForHost(DEFAULT_API_HOST)).to.equal(DEFAULT_CREDENTIAL_SERVICE)
  })

  it('namespaces non-production hosts as heroku-cli@<host>', function () {
    expect(credentialServiceForHost('api.staging.herokudev.com')).to.equal('heroku-cli@api.staging.herokudev.com')
  })
})
