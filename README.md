# Heroku Credential Manager

A library for managing Heroku CLI credentials. It uses the native credential store on macOS, Windows, and GNU/Linux when available, and supports `.netrc` storage.

## Features

- Credential storage, retrieval, and deletion using native credential stores by default.
- Selects appropriate credential management tool based on system capabilities.
- Uses `.netrc` when native storage is unavailable or when `HEROKU_NETRC_WRITE=true`.
- Removes credentials from both native storage and `.netrc` so stale credentials are cleaned up when storage modes change.
- Provides an isolated `@heroku/heroku-credential-manager/login` entry point for injected browser, interactive, and legacy SSO login flows.

## Quick Start

### Requirements

Node.js 20.5.0 or later is required.

### Installation

```bash
# npm
npm install @heroku/heroku-credential-manager

# pnpm
pnpm add @heroku/heroku-credential-manager

# yarn
yarn add @heroku/heroku-credential-manager
```

### Usage Examples

```typescript
import {getAuth, removeAuth, saveAuth} from '@heroku/heroku-credential-manager'

await saveAuth('user@example.com', 'token', ['api.heroku.com'])

const auth = await getAuth('user@example.com', 'api.heroku.com')
// auth is {account: 'user@example.com', token: 'token'}

await removeAuth('user@example.com', ['api.heroku.com'])
```

`saveAuth(account, token, hosts, service?)` stores the credential. `getAuth(account, host, service?)` returns the stored account and token; pass `undefined` for the account to read the host from `.netrc`. When an account is provided, a native miss falls back only to a matching `.netrc` login; native backend errors are surfaced. `removeAuth(account, hosts, service?)` removes the requested credential. The optional service defaults to `heroku-cli`.

### Storage behavior

On non-Windows platforms, `.netrc` writes open the netrc path with `O_NOFOLLOW` and refuse a symbolic link at that path. Reads through a symbolic link remain supported, and a rejected write leaves the link target unchanged. Dotfile-manager setups that symlink `.netrc` must use a regular file at the netrc path for operations that write it.

A successful native credential-store save removes matching stale `.netrc` entries for the supplied hosts. Entries belonging to another login are preserved.

Native backend errors are surfaced rather than hidden by `.netrc` fallback. Only a confirmed missing native credential falls back to `.netrc`.

The native handlers throw `NativeCredentialNotFoundError` for a confirmed missing credential. Consumers calling a handler directly can distinguish that result from an unavailable or degraded backend:

```typescript
import {NativeCredentialNotFoundError} from '@heroku/heroku-credential-manager'

try {
  handler.getAuth('user@example.com', 'heroku-cli')
} catch (error) {
  if (error instanceof NativeCredentialNotFoundError) {
    // The native credential does not exist.
  } else {
    throw error
  }
}
```

Top-level `removeAuth` removes the supplied `.netrc` hosts regardless of their stored login so logout can clean credentials after storage-mode changes.

### Injected login consumers

Login is intentionally available only from the `/login` subpath. Consumers provide semantic prompts and may inject HTTP, browser opening, output/progress, timers, environment/config, and storage behavior. This keeps command frameworks and browser packages outside the credential manager:

```typescript
import {Login} from '@heroku/heroku-credential-manager/login'

const login = new Login({
  browser: {open: async url => launchBrowser(url)},
  prompt: {
    accessToken: () => promptSecret('Access token'),
    email: previous => promptText('Email', previous),
    loginMethod: () => readLoginKey(),
    organization: previous => promptText('Organization name', previous),
    password: () => promptSecret('Password'),
    secondFactor: () => promptSecret('Two-factor code'),
  },
})

const auth = await login.login({method: 'browser'})
await login.logout(auth)
```

`login()` supports `browser`, `interactive`, and `sso`, returns a persisted `{account, token}`, never revokes an existing session during re-login, and rejects cancellation with `LoginCancelledError` (`exitCode` is `130` for Ctrl-C and `0` for `q`). Browser and SSO flows always emit a manual URL; failure to open a browser does not invalidate that flow. The default storage adapter uses this package's native/`.netrc` APIs and writes login state only when native storage and `dataDir` are available. `logout(entry?)` always clears local API/Git credentials and login state, including when remote revocation fails.

## Development

```bash
npm ci
npm run typecheck
npm run build
npm run lint
npm run unit
npm run test:package
```

`npm run test:package` verifies the packed tarball in an isolated consumer project without accessing the user's real credential files.

## License

Apache-2.0. See [LICENSE.txt](LICENSE.txt) for details.

## Contributing

We welcome issues and PRs. Please follow conventional commits, keep changes
under 200 lines per commit, and ensure tests and type checks pass. See
`CONTRIBUTING.md` for details.
