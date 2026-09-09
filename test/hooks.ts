import nock from 'nock'

export const mochaHooks = {
  beforeAll() {
    nock.disableNetConnect()
  },
}
