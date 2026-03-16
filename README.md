
# Heroku Credential Manager

A tool for managing Heroku credential storage for the CLI. It uses native keychain services on macOS, Windows, and Gnu-based Linux systems by default to store credentials securely.

## Features

- Credential storage, retrieval, and deletion using native keychain services by default.
- Selects appropriate credential management tool based on system capabilities.
- Offers credential storage, retrieval, and deletion using `.netrc` files by demand and as a backup for systems that do not support native keychain services.

## Quick Start

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

#### Default usage
```typescript
import {saveAuth, getAuth, removeAuth} from '@heroku/heroku-credential-manager'

// Store credentials
await saveAuth('account', 'token', ['host1'])

// Retrieve credentials
await getAuth(['host1'])

// Remove credentials
await removeAuth(['host1'])
```

## License

Apache-2.0. See `LICENSE` for details.

## Contributing

We welcome issues and PRs. Please follow conventional commits, keep changes
under 200 lines per commit, and ensure tests and type checks pass. See
`CONTRIBUTING.md` for details.
