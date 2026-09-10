import type {LoginStorage} from './types.js'

import {
  deleteLoginState,
  getAuth,
  getStorageConfig,
  readLoginState,
  removeAuth,
  saveAuth,
  writeLoginState,
} from '../index.js'

export const defaultLoginStorage: LoginStorage = {
  deleteLoginState,
  getAuth: (account, host, service) => getAuth(account, host, service),
  hasNativeStorage: () => Boolean(getStorageConfig().credentialStore),
  readLoginState,
  removeAuth: (account, hosts, service, expectedToken) => removeAuth(account, hosts, service, expectedToken),
  saveAuth: (account, token, hosts, service) => saveAuth(account, token, hosts, service),
  writeLoginState,
}
