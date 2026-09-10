import type {LoginStorage} from './types.js'

import {
  deleteLoginState,
  getAuth,
  getNativeCredentialStore,
  readLoginState,
  removeAuth,
  saveAuth,
  writeLoginState,
} from '../index.js'

export const defaultLoginStorage: LoginStorage = {
  deleteLoginState,
  getAuth,
  hasNativeStorage: () => Boolean(getNativeCredentialStore()),
  readLoginState,
  removeAuth,
  saveAuth,
  writeLoginState,
}
