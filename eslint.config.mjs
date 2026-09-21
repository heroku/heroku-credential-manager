// ESLint 9 flat config. The shared Heroku CLI ruleset (and the oclif base it
// extends) ships from @heroku-cli/test-utils; the mocha overlay makes a stray
// `it.only` fail lint. Repo-specific relaxations follow.
import herokuConfig from '@heroku-cli/test-utils/eslint-config'
import mochaOverlay from '@heroku-cli/test-utils/eslint-config/mocha'

export default [
  ...herokuConfig,
  ...mochaOverlay,
  {
    files: ['**/*.ts'],
    rules: {
      // The Web APIs below ship as globals on the repo's runtime (Node >=18 has
      // global fetch; stabilized in 21) and are relied on by src/login. The `n`
      // plugin is conservative about the `engines` range, so allow them.
      'n/no-unsupported-features/node-builtins': ['error', {
        ignores: ['fetch', 'FormData', 'Headers', 'Request', 'Response'],
      }],
      // TypeScript resolves identifiers itself; `no-undef` only produces false
      // positives on type-only references (e.g. the `RequestInit` DOM lib type).
      'no-undef': 'off',
    },
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'unicorn/no-empty-file': 'warn',
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      // Tests use the `import sinon from 'sinon'; sinon.stub()` idiom; the rule
      // false-flags every `sinon.<member>` because sinon also has named exports.
      'import/no-named-as-default-member': 'off',
    },
  },
]
