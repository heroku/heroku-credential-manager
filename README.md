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

`saveAuth(account, token, hosts, service?)` stores the credential. `getAuth(account, host, service?)` returns the stored account and token; pass `undefined` for the account to read the host from `.netrc`. When an account is provided, a native miss falls back only to a matching `.netrc` login; native backend errors are surfaced. `removeAuth(account, hosts, service?, expectedToken?)` removes the requested credential. A supplied account guards `.netrc` removal so only entries with that login are eligible; `undefined` retains unconditional cleanup of the supplied hosts. The optional `expectedToken` is a best-effort conditional safeguard against deleting a replacement token, not a guarantee of atomic cross-process cleanup. The optional service defaults to `heroku-cli`.

### Storage behavior

On non-Windows platforms, `.netrc` reads and writes use no-follow file opens and refuse a symbolic link at that path. Encrypted `.netrc.gpg` data is securely opened and sent to GPG over standard input rather than passing its path to GPG. Writes use restricted-permission temporary files followed by atomic rename; handler mutations serialize their read/modify/write transaction with an ownership-checked lock. Direct public `Netrc` load/edit/save sequences do not share that transaction lock, so callers that need serialized mutation should use `NetrcHandler`. Windows retries transient atomic-rename sharing failures without an unlink gap. Node does not expose a portable API for applying an explicit Windows ACL, so protection there relies on the containing directory and the user's inherited ACL.

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

Top-level `removeAuth` uses a supplied account to guard `.netrc` entries by login. Passing `undefined` removes the supplied hosts regardless of stored login so callers can request unconditional host cleanup after storage-mode changes.

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

`login()` supports `browser`, `interactive`, and `sso`, returns a persisted `{account, token}`, never revokes an existing session during re-login, and rejects cancellation with `LoginCancelledError` (`exitCode` is `130` for Ctrl-C and `0` for `q`). Browser and SSO flows always emit a manual URL; failure to open a browser does not invalidate that flow. The default storage adapter uses this package's native/`.netrc` APIs. `logout(entry)` requires the returned credential entry and always attempts local API/Git credential cleanup, including when remote revocation fails. With the canonical `heroku-cli` credential service it also attempts configured login-state cleanup; isolated custom services intentionally skip the global `login.json` state. Backing-store failures can prevent guaranteed removal.

Environment-derived `HEROKU_HOST` and `HEROKU_API_URL` values are restricted to Heroku domains and exact loopback hosts. Consumers that intentionally target a private or custom HTTPS deployment must provide `config.apiUrl` explicitly; callers are responsible for treating endpoint configuration as trusted. Base `apiUrl` and `loginHost` values must not contain a query or fragment, while `ssoUrl` is a complete URL and may contain both. For an explicit custom `apiUrl` or `HEROKU_API_URL`, omitting `gitHost` avoids writing the API credential for any Git host; set a trusted `gitHost` explicitly to opt in. The canonical `api.heroku.com` endpoint uses the existing `heroku-cli` native credential service. Other API hosts derive an isolated `heroku-cli@<normalized-api-host>` service, including an explicit port, so custom native credentials do not collide with production. `config.credentialService` can override that namespace with a nonempty, NUL-free value. Any service other than `heroku-cli` skips the global `login.json` account-selection state to avoid cross-service state collisions. The default HTTP adapter rejects all redirects and identifies itself with a package-specific User-Agent. CLI adapters must preserve the CLI's existing host allowlist and warning/fallback behavior.

`config.timeoutMs` limits login acquisition (10 minutes by default), but does not cancel credential persistence after credentials have been acquired. For logout, the same timeout is the remote-revocation deadline: it aborts remote requests, while already-started local credential and login-state cleanup is awaited because those operations are not cancellable. Logout therefore has no overall time bound and remains pending indefinitely if local cleanup never settles. Cleanup passes the logged-out token as `expectedToken` as defense in depth. Netrc cleanup through `NetrcHandler` performs that check within its serialized transaction; native credential backends may still expose a check/remove race because their APIs do not provide a portable compare-and-delete operation. `config.requestTimeoutMs` separately limits each HTTP request. In forced-netrc mode (`HEROKU_NETRC_WRITE=true`), login credentials persist only to `.netrc`, interactive login prefills the account from the API host's `.netrc` entry, and login does not read or write native `login.json` state even when a native credential backend is installed. Logout and top-level `removeAuth` may still attempt OS-native cleanup so credentials left by an earlier storage mode do not remain stale.

## Development

```bash
npm ci
npm run typecheck
npm run build
npm run lint
npm run unit
npm run test:package
```

`npm run test:package` verifies the packed tarball in isolated runtime and type-checking consumer projects. It uses an isolated home directory so the exercised netrc and login-state paths avoid the user's normal credential files, and verifies that the root runtime entry point does not pull in the separately exported login implementation or its framework/browser dependency concerns.

## License

Apache-2.0. See [LICENSE.txt](LICENSE.txt) for details.

## Contributing

We welcome issues and PRs. Please follow conventional commits, keep changes
under 200 lines per commit, and ensure tests and type checks pass. See
`CONTRIBUTING.md` for details.
