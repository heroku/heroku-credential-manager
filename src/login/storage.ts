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
  getAuth,
  hasNativeStorage: () => Boolean(getStorageConfig().credentialStore),
  readLoginState,
  removeAuth,
  saveAuth,
  writeLoginState,
}
