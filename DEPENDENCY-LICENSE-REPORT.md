# Dependency License Report: @heroku/heroku-credential-manager

**Snapshot date:** 2026-10-05  
**Package version:** 0.1.0  
**Project license:** Apache-2.0  
**Status:** Inventory for OSS Legal review; not a legal approval or substitute for required internal review.

## Executive Summary

@heroku/heroku-credential-manager is a Node.js library for Heroku CLI credential storage and login integrations. It uses native credential stores where available and supports .netrc; consumers install it as an npm package. The project declares three direct production dependencies. The committed npm lockfile contains **621 external package records**: **28 runtime** and **593 development/build/test** records. NPM marks **28** records optional; all are development-only.

The lockfile contains these license values and record counts:

| License expression in lockfile | Records |
| --- | ---: |
| (BSD-2-Clause OR WTFPL) | 1 |
| (MIT OR CC0-1.0) | 4 |
| 0BSD | 1 |
| Apache-2.0 | 43 |
| BlueOak-1.0.0 | 7 |
| BSD-2-Clause | 8 |
| BSD-3-Clause | 17 |
| CC-BY-3.0 | 1 |
| CC-BY-4.0 | 1 |
| CC0-1.0 | 2 |
| ISC | 53 |
| MISSING LICENSE FIELD | 1 |
| MIT | 481 |
| Python-2.0 | 1 |

One development transitive package has no license field in the lockfile: regjsparser/node_modules/jsesc@0.5.0. Its license is intentionally reported as missing, not inferred. Two parenthesized OR expressions are preserved exactly from metadata: (MIT OR CC0-1.0) (4 records) and (BSD-2-Clause OR WTFPL) (1 record). Confirm accepted choice and interpretation with OSS Legal. No license has been approved by this report.

## Project and Distribution

The README describes a library that saves, retrieves, and removes Heroku CLI credentials using native credential stores or .netrc, and exposes a separate /login entry point for injected browser, interactive, and legacy SSO flows. The package manifest requires Node.js >=20.5.0 and sets publishConfig.access to restricted.

The manifest publishes dist through its files allowlist and declares JavaScript entry points for compiled dist output. The build script runs TypeScript (tsc); the TypeScript configuration uses importHelpers and no bundler is configured. On that evidence, the package appears to redistribute its own compiled project code, not vendor its npm dependencies into that code. Its three production dependencies are declared under dependencies and are expected to be installed or resolved by the consuming npm environment. TypeScript helper imports mean tslib is also a runtime transitive dependency. Development dependencies support build, lint, and test workflows and are not declared as production dependencies.

This is a metadata/build-configuration assessment, not a legal conclusion. Confirm exact release tarball contents and delivery behavior before relying on the non-bundling conclusion. No generated tarball was examined for this report.

## Method and Scope

- Resolved versions, package paths, license strings, optional markers, and registry tarball URLs come from committed package-lock.json (lockfile version 3).
- Direct runtime versus development classification comes from root dependencies and devDependencies in package.json, cross-checked against each lock entry's dev and optional markers.
- The inventory includes every non-root record in the lockfile, including platform-specific optional packages and duplicate versions installed at different paths. Development scope groups build, lint, test, and their transitive packages; the lockfile does not separate these lifecycle phases per package.
- License values below are transcribed from lockfile metadata. Missing or ambiguous package evidence was not resolved against upstream source archives. MISSING LICENSE FIELD means the lockfile provides no value; it does not establish that the package is unlicensed.
- Runtime/development labels describe this repository's dependency graph, not an independent legal determination of whether an item is a dependency under a particular review process.
- Node.js and npm itself are not listed as package dependencies.

## Direct Production Dependencies

| Package | Declared range | Locked version | Lockfile license |
| --- | --- | --- | --- |
| @heroku/js-blanket | ^1.0.0 | 1.1.0 | Apache-2.0 |
| debug | ^4.4.0 | 4.4.3 | MIT |
| execa | ^9.6.1 | 9.6.1 | MIT |

## Complete Locked Dependency Inventory

The install path preserves NPM's location so duplicate package versions remain distinguishable. The license column is the exact value recorded in the lockfile. Source links point to the resolved npm registry tarball when recorded. Optional reflects the package record's optional marker.

### Runtime Records (28)

| Package | Install path | Version | License | Optional | Source |
| --- | --- | --- | --- | --- | --- |
| @heroku/js-blanket | node_modules/@heroku/js-blanket | 1.1.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@heroku/js-blanket/-/js-blanket-1.1.0.tgz) |
| @sec-ant/readable-stream | node_modules/@sec-ant/readable-stream | 0.4.1 | MIT | No | [npm registry](https://registry.npmjs.org/@sec-ant/readable-stream/-/readable-stream-0.4.1.tgz) |
| @sindresorhus/merge-streams | node_modules/@sindresorhus/merge-streams | 4.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/@sindresorhus/merge-streams/-/merge-streams-4.0.0.tgz) |
| cross-spawn | node_modules/cross-spawn | 7.0.6 | MIT | No | [npm registry](https://registry.npmjs.org/cross-spawn/-/cross-spawn-7.0.6.tgz) |
| debug | node_modules/debug | 4.4.3 | MIT | No | [npm registry](https://registry.npmjs.org/debug/-/debug-4.4.3.tgz) |
| execa | node_modules/execa | 9.6.1 | MIT | No | [npm registry](https://registry.npmjs.org/execa/-/execa-9.6.1.tgz) |
| is-stream | node_modules/execa/node_modules/is-stream | 4.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/is-stream/-/is-stream-4.0.1.tgz) |
| figures | node_modules/figures | 6.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/figures/-/figures-6.1.0.tgz) |
| get-stream | node_modules/get-stream | 9.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/get-stream/-/get-stream-9.0.1.tgz) |
| is-stream | node_modules/get-stream/node_modules/is-stream | 4.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/is-stream/-/is-stream-4.0.1.tgz) |
| human-signals | node_modules/human-signals | 8.0.1 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/human-signals/-/human-signals-8.0.1.tgz) |
| is-plain-obj | node_modules/is-plain-obj | 4.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-plain-obj/-/is-plain-obj-4.1.0.tgz) |
| is-unicode-supported | node_modules/is-unicode-supported | 2.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-unicode-supported/-/is-unicode-supported-2.1.0.tgz) |
| isexe | node_modules/isexe | 2.0.0 | ISC | No | [npm registry](https://registry.npmjs.org/isexe/-/isexe-2.0.0.tgz) |
| ms | node_modules/ms | 2.1.3 | MIT | No | [npm registry](https://registry.npmjs.org/ms/-/ms-2.1.3.tgz) |
| npm-run-path | node_modules/npm-run-path | 6.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/npm-run-path/-/npm-run-path-6.0.0.tgz) |
| path-key | node_modules/npm-run-path/node_modules/path-key | 4.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/path-key/-/path-key-4.0.0.tgz) |
| parse-ms | node_modules/parse-ms | 4.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/parse-ms/-/parse-ms-4.0.0.tgz) |
| path-key | node_modules/path-key | 3.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/path-key/-/path-key-3.1.1.tgz) |
| pretty-ms | node_modules/pretty-ms | 9.3.1 | MIT | No | [npm registry](https://registry.npmjs.org/pretty-ms/-/pretty-ms-9.3.1.tgz) |
| shebang-command | node_modules/shebang-command | 2.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/shebang-command/-/shebang-command-2.0.0.tgz) |
| shebang-regex | node_modules/shebang-regex | 3.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/shebang-regex/-/shebang-regex-3.0.0.tgz) |
| signal-exit | node_modules/signal-exit | 4.1.0 | ISC | No | [npm registry](https://registry.npmjs.org/signal-exit/-/signal-exit-4.1.0.tgz) |
| strip-final-newline | node_modules/strip-final-newline | 4.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/strip-final-newline/-/strip-final-newline-4.0.0.tgz) |
| tslib | node_modules/tslib | 2.8.1 | 0BSD | No | [npm registry](https://registry.npmjs.org/tslib/-/tslib-2.8.1.tgz) |
| unicorn-magic | node_modules/unicorn-magic | 0.3.0 | MIT | No | [npm registry](https://registry.npmjs.org/unicorn-magic/-/unicorn-magic-0.3.0.tgz) |
| which | node_modules/which | 2.0.2 | ISC | No | [npm registry](https://registry.npmjs.org/which/-/which-2.0.2.tgz) |
| yoctocolors | node_modules/yoctocolors | 2.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/yoctocolors/-/yoctocolors-2.2.0.tgz) |

### Development, Build, and Test Records (593)

| Package | Install path | Version | License | Optional | Source |
| --- | --- | --- | --- | --- | --- |
| @babel/code-frame | node_modules/@babel/code-frame | 7.29.7 | MIT | No | [npm registry](https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.29.7.tgz) |
| @babel/helper-validator-identifier | node_modules/@babel/helper-validator-identifier | 7.29.7 | MIT | No | [npm registry](https://registry.npmjs.org/@babel/helper-validator-identifier/-/helper-validator-identifier-7.29.7.tgz) |
| @bcoe/v8-coverage | node_modules/@bcoe/v8-coverage | 0.2.3 | MIT | No | [npm registry](https://registry.npmjs.org/@bcoe/v8-coverage/-/v8-coverage-0.2.3.tgz) |
| @cspotcode/source-map-support | node_modules/@cspotcode/source-map-support | 0.8.1 | MIT | No | [npm registry](https://registry.npmjs.org/@cspotcode/source-map-support/-/source-map-support-0.8.1.tgz) |
| @emnapi/core | node_modules/@emnapi/core | 1.10.0 | MIT | Yes | [npm registry](https://registry.npmjs.org/@emnapi/core/-/core-1.10.0.tgz) |
| @emnapi/runtime | node_modules/@emnapi/runtime | 1.10.0 | MIT | Yes | [npm registry](https://registry.npmjs.org/@emnapi/runtime/-/runtime-1.10.0.tgz) |
| @emnapi/wasi-threads | node_modules/@emnapi/wasi-threads | 1.2.1 | MIT | Yes | [npm registry](https://registry.npmjs.org/@emnapi/wasi-threads/-/wasi-threads-1.2.1.tgz) |
| @es-joy/jsdoccomment | node_modules/@es-joy/jsdoccomment | 0.50.2 | MIT | No | [npm registry](https://registry.npmjs.org/@es-joy/jsdoccomment/-/jsdoccomment-0.50.2.tgz) |
| @eslint-community/eslint-utils | node_modules/@eslint-community/eslint-utils | 4.10.1 | MIT | No | [npm registry](https://registry.npmjs.org/@eslint-community/eslint-utils/-/eslint-utils-4.10.1.tgz) |
| eslint-visitor-keys | node_modules/@eslint-community/eslint-utils/node_modules/eslint-visitor-keys | 3.4.3 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-3.4.3.tgz) |
| @eslint-community/regexpp | node_modules/@eslint-community/regexpp | 4.12.2 | MIT | No | [npm registry](https://registry.npmjs.org/@eslint-community/regexpp/-/regexpp-4.12.2.tgz) |
| @eslint/compat | node_modules/@eslint/compat | 1.4.1 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@eslint/compat/-/compat-1.4.1.tgz) |
| @eslint/config-array | node_modules/@eslint/config-array | 0.21.2 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@eslint/config-array/-/config-array-0.21.2.tgz) |
| balanced-match | node_modules/@eslint/config-array/node_modules/balanced-match | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz) |
| brace-expansion | node_modules/@eslint/config-array/node_modules/brace-expansion | 1.1.21 | MIT | No | [npm registry](https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.21.tgz) |
| minimatch | node_modules/@eslint/config-array/node_modules/minimatch | 3.1.5 | ISC | No | [npm registry](https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz) |
| @eslint/config-helpers | node_modules/@eslint/config-helpers | 0.4.2 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@eslint/config-helpers/-/config-helpers-0.4.2.tgz) |
| @eslint/core | node_modules/@eslint/core | 0.17.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@eslint/core/-/core-0.17.0.tgz) |
| @eslint/css | node_modules/@eslint/css | 0.10.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@eslint/css/-/css-0.10.0.tgz) |
| @eslint/css-tree | node_modules/@eslint/css-tree | 3.6.9 | MIT | No | [npm registry](https://registry.npmjs.org/@eslint/css-tree/-/css-tree-3.6.9.tgz) |
| @eslint/core | node_modules/@eslint/css/node_modules/@eslint/core | 0.14.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@eslint/core/-/core-0.14.0.tgz) |
| @eslint/plugin-kit | node_modules/@eslint/css/node_modules/@eslint/plugin-kit | 0.3.5 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@eslint/plugin-kit/-/plugin-kit-0.3.5.tgz) |
| @eslint/core | node_modules/@eslint/css/node_modules/@eslint/plugin-kit/node_modules/@eslint/core | 0.15.2 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@eslint/core/-/core-0.15.2.tgz) |
| @eslint/eslintrc | node_modules/@eslint/eslintrc | 3.3.7 | MIT | No | [npm registry](https://registry.npmjs.org/@eslint/eslintrc/-/eslintrc-3.3.7.tgz) |
| balanced-match | node_modules/@eslint/eslintrc/node_modules/balanced-match | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz) |
| brace-expansion | node_modules/@eslint/eslintrc/node_modules/brace-expansion | 1.1.21 | MIT | No | [npm registry](https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.21.tgz) |
| minimatch | node_modules/@eslint/eslintrc/node_modules/minimatch | 3.1.5 | ISC | No | [npm registry](https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz) |
| @eslint/js | node_modules/@eslint/js | 9.39.5 | MIT | No | [npm registry](https://registry.npmjs.org/@eslint/js/-/js-9.39.5.tgz) |
| @eslint/json | node_modules/@eslint/json | 0.13.2 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@eslint/json/-/json-0.13.2.tgz) |
| @eslint/core | node_modules/@eslint/json/node_modules/@eslint/core | 0.15.2 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@eslint/core/-/core-0.15.2.tgz) |
| @eslint/plugin-kit | node_modules/@eslint/json/node_modules/@eslint/plugin-kit | 0.3.5 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@eslint/plugin-kit/-/plugin-kit-0.3.5.tgz) |
| @eslint/object-schema | node_modules/@eslint/object-schema | 2.1.7 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@eslint/object-schema/-/object-schema-2.1.7.tgz) |
| @eslint/plugin-kit | node_modules/@eslint/plugin-kit | 0.4.1 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@eslint/plugin-kit/-/plugin-kit-0.4.1.tgz) |
| @heroku-cli/command | node_modules/@heroku-cli/command | 12.4.2 | ISC | No | [npm registry](https://registry.npmjs.org/@heroku-cli/command/-/command-12.4.2.tgz) |
| @heroku-cli/test-utils | node_modules/@heroku-cli/test-utils | 1.0.2 | ISC | No | [npm registry](https://registry.npmjs.org/@heroku-cli/test-utils/-/test-utils-1.0.2.tgz) |
| @heroku/http-call | node_modules/@heroku/http-call | 5.6.1 | ISC | No | [npm registry](https://registry.npmjs.org/@heroku/http-call/-/http-call-5.6.1.tgz) |
| @humanfs/core | node_modules/@humanfs/core | 0.19.2 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@humanfs/core/-/core-0.19.2.tgz) |
| @humanfs/node | node_modules/@humanfs/node | 0.16.8 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@humanfs/node/-/node-0.16.8.tgz) |
| @humanfs/types | node_modules/@humanfs/types | 0.15.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@humanfs/types/-/types-0.15.0.tgz) |
| @humanwhocodes/module-importer | node_modules/@humanwhocodes/module-importer | 1.0.1 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@humanwhocodes/module-importer/-/module-importer-1.0.1.tgz) |
| @humanwhocodes/momoa | node_modules/@humanwhocodes/momoa | 3.3.13 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@humanwhocodes/momoa/-/momoa-3.3.13.tgz) |
| @humanwhocodes/retry | node_modules/@humanwhocodes/retry | 0.4.3 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@humanwhocodes/retry/-/retry-0.4.3.tgz) |
| @inquirer/ansi | node_modules/@inquirer/ansi | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/ansi/-/ansi-1.0.2.tgz) |
| @inquirer/checkbox | node_modules/@inquirer/checkbox | 4.3.2 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/checkbox/-/checkbox-4.3.2.tgz) |
| @inquirer/confirm | node_modules/@inquirer/confirm | 5.1.21 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/confirm/-/confirm-5.1.21.tgz) |
| @inquirer/core | node_modules/@inquirer/core | 10.3.2 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/core/-/core-10.3.2.tgz) |
| wrap-ansi | node_modules/@inquirer/core/node_modules/wrap-ansi | 6.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-6.2.0.tgz) |
| @inquirer/editor | node_modules/@inquirer/editor | 4.2.23 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/editor/-/editor-4.2.23.tgz) |
| @inquirer/expand | node_modules/@inquirer/expand | 4.0.23 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/expand/-/expand-4.0.23.tgz) |
| @inquirer/external-editor | node_modules/@inquirer/external-editor | 1.0.3 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/external-editor/-/external-editor-1.0.3.tgz) |
| @inquirer/figures | node_modules/@inquirer/figures | 1.0.15 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/figures/-/figures-1.0.15.tgz) |
| @inquirer/input | node_modules/@inquirer/input | 4.3.1 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/input/-/input-4.3.1.tgz) |
| @inquirer/number | node_modules/@inquirer/number | 3.0.23 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/number/-/number-3.0.23.tgz) |
| @inquirer/password | node_modules/@inquirer/password | 4.0.23 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/password/-/password-4.0.23.tgz) |
| @inquirer/prompts | node_modules/@inquirer/prompts | 7.10.1 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/prompts/-/prompts-7.10.1.tgz) |
| @inquirer/rawlist | node_modules/@inquirer/rawlist | 4.1.11 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/rawlist/-/rawlist-4.1.11.tgz) |
| @inquirer/search | node_modules/@inquirer/search | 3.2.2 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/search/-/search-3.2.2.tgz) |
| @inquirer/select | node_modules/@inquirer/select | 4.4.2 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/select/-/select-4.4.2.tgz) |
| @inquirer/type | node_modules/@inquirer/type | 3.0.10 | MIT | No | [npm registry](https://registry.npmjs.org/@inquirer/type/-/type-3.0.10.tgz) |
| @istanbuljs/schema | node_modules/@istanbuljs/schema | 0.1.6 | MIT | No | [npm registry](https://registry.npmjs.org/@istanbuljs/schema/-/schema-0.1.6.tgz) |
| @jridgewell/resolve-uri | node_modules/@jridgewell/resolve-uri | 3.1.2 | MIT | No | [npm registry](https://registry.npmjs.org/@jridgewell/resolve-uri/-/resolve-uri-3.1.2.tgz) |
| @jridgewell/sourcemap-codec | node_modules/@jridgewell/sourcemap-codec | 1.6.0 | MIT | No | [npm registry](https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.6.0.tgz) |
| @jridgewell/trace-mapping | node_modules/@jridgewell/trace-mapping | 0.3.9 | MIT | No | [npm registry](https://registry.npmjs.org/@jridgewell/trace-mapping/-/trace-mapping-0.3.9.tgz) |
| @mswjs/interceptors | node_modules/@mswjs/interceptors | 0.41.9 | MIT | No | [npm registry](https://registry.npmjs.org/@mswjs/interceptors/-/interceptors-0.41.9.tgz) |
| @napi-rs/wasm-runtime | node_modules/@napi-rs/wasm-runtime | 1.2.4 | MIT | Yes | [npm registry](https://registry.npmjs.org/@napi-rs/wasm-runtime/-/wasm-runtime-1.2.4.tgz) |
| @nolyfill/is-core-module | node_modules/@nolyfill/is-core-module | 1.0.39 | MIT | No | [npm registry](https://registry.npmjs.org/@nolyfill/is-core-module/-/is-core-module-1.0.39.tgz) |
| @oclif/core | node_modules/@oclif/core | 4.14.0 | MIT | No | [npm registry](https://registry.npmjs.org/@oclif/core/-/core-4.14.0.tgz) |
| ansis | node_modules/@oclif/core/node_modules/ansis | 3.17.0 | ISC | No | [npm registry](https://registry.npmjs.org/ansis/-/ansis-3.17.0.tgz) |
| @open-draft/deferred-promise | node_modules/@open-draft/deferred-promise | 2.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/@open-draft/deferred-promise/-/deferred-promise-2.2.0.tgz) |
| @open-draft/logger | node_modules/@open-draft/logger | 0.3.0 | MIT | No | [npm registry](https://registry.npmjs.org/@open-draft/logger/-/logger-0.3.0.tgz) |
| @open-draft/until | node_modules/@open-draft/until | 2.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/@open-draft/until/-/until-2.1.0.tgz) |
| @opentelemetry/api | node_modules/@opentelemetry/api | 1.9.1 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@opentelemetry/api/-/api-1.9.1.tgz) |
| @opentelemetry/api-logs | node_modules/@opentelemetry/api-logs | 0.220.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@opentelemetry/api-logs/-/api-logs-0.220.0.tgz) |
| @opentelemetry/core | node_modules/@opentelemetry/core | 2.11.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@opentelemetry/core/-/core-2.11.0.tgz) |
| @opentelemetry/instrumentation | node_modules/@opentelemetry/instrumentation | 0.220.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@opentelemetry/instrumentation/-/instrumentation-0.220.0.tgz) |
| @opentelemetry/resources | node_modules/@opentelemetry/resources | 2.11.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@opentelemetry/resources/-/resources-2.11.0.tgz) |
| @opentelemetry/sdk-trace | node_modules/@opentelemetry/sdk-trace | 2.11.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@opentelemetry/sdk-trace/-/sdk-trace-2.11.0.tgz) |
| @opentelemetry/sdk-trace-base | node_modules/@opentelemetry/sdk-trace-base | 2.11.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@opentelemetry/sdk-trace-base/-/sdk-trace-base-2.11.0.tgz) |
| @opentelemetry/semantic-conventions | node_modules/@opentelemetry/semantic-conventions | 1.43.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/@opentelemetry/semantic-conventions/-/semantic-conventions-1.43.0.tgz) |
| @rtsao/scc | node_modules/@rtsao/scc | 1.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/@rtsao/scc/-/scc-1.1.0.tgz) |
| @sentry/conventions | node_modules/@sentry/conventions | 0.16.0 | MIT | No | [npm registry](https://registry.npmjs.org/@sentry/conventions/-/conventions-0.16.0.tgz) |
| @sentry/core | node_modules/@sentry/core | 10.74.0 | MIT | No | [npm registry](https://registry.npmjs.org/@sentry/core/-/core-10.74.0.tgz) |
| @sentry/node | node_modules/@sentry/node | 10.74.0 | MIT | No | [npm registry](https://registry.npmjs.org/@sentry/node/-/node-10.74.0.tgz) |
| @sentry/node-core | node_modules/@sentry/node-core | 10.74.0 | MIT | No | [npm registry](https://registry.npmjs.org/@sentry/node-core/-/node-core-10.74.0.tgz) |
| @sentry/opentelemetry | node_modules/@sentry/opentelemetry | 10.74.0 | MIT | No | [npm registry](https://registry.npmjs.org/@sentry/opentelemetry/-/opentelemetry-10.74.0.tgz) |
| @sentry/server-utils | node_modules/@sentry/server-utils | 10.74.0 | MIT | No | [npm registry](https://registry.npmjs.org/@sentry/server-utils/-/server-utils-10.74.0.tgz) |
| @sinonjs/commons | node_modules/@sinonjs/commons | 3.0.1 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/@sinonjs/commons/-/commons-3.0.1.tgz) |
| type-detect | node_modules/@sinonjs/commons/node_modules/type-detect | 4.0.8 | MIT | No | [npm registry](https://registry.npmjs.org/type-detect/-/type-detect-4.0.8.tgz) |
| @sinonjs/fake-timers | node_modules/@sinonjs/fake-timers | 11.2.2 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/@sinonjs/fake-timers/-/fake-timers-11.2.2.tgz) |
| @sinonjs/samsam | node_modules/@sinonjs/samsam | 8.0.3 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/@sinonjs/samsam/-/samsam-8.0.3.tgz) |
| @stylistic/eslint-plugin | node_modules/@stylistic/eslint-plugin | 3.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/@stylistic/eslint-plugin/-/eslint-plugin-3.1.0.tgz) |
| @tsconfig/node10 | node_modules/@tsconfig/node10 | 1.0.13 | MIT | No | [npm registry](https://registry.npmjs.org/@tsconfig/node10/-/node10-1.0.13.tgz) |
| @tsconfig/node12 | node_modules/@tsconfig/node12 | 1.0.11 | MIT | No | [npm registry](https://registry.npmjs.org/@tsconfig/node12/-/node12-1.0.11.tgz) |
| @tsconfig/node14 | node_modules/@tsconfig/node14 | 1.0.3 | MIT | No | [npm registry](https://registry.npmjs.org/@tsconfig/node14/-/node14-1.0.3.tgz) |
| @tsconfig/node16 | node_modules/@tsconfig/node16 | 1.0.4 | MIT | No | [npm registry](https://registry.npmjs.org/@tsconfig/node16/-/node16-1.0.4.tgz) |
| @tybys/wasm-util | node_modules/@tybys/wasm-util | 0.10.4 | MIT | Yes | [npm registry](https://registry.npmjs.org/@tybys/wasm-util/-/wasm-util-0.10.4.tgz) |
| @types/chai | node_modules/@types/chai | 4.3.20 | MIT | No | [npm registry](https://registry.npmjs.org/@types/chai/-/chai-4.3.20.tgz) |
| @types/chai-as-promised | node_modules/@types/chai-as-promised | 8.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/@types/chai-as-promised/-/chai-as-promised-8.0.2.tgz) |
| @types/debug | node_modules/@types/debug | 4.1.13 | MIT | No | [npm registry](https://registry.npmjs.org/@types/debug/-/debug-4.1.13.tgz) |
| @types/estree | node_modules/@types/estree | 1.0.9 | MIT | No | [npm registry](https://registry.npmjs.org/@types/estree/-/estree-1.0.9.tgz) |
| @types/fs-extra | node_modules/@types/fs-extra | 11.0.4 | MIT | No | [npm registry](https://registry.npmjs.org/@types/fs-extra/-/fs-extra-11.0.4.tgz) |
| @types/istanbul-lib-coverage | node_modules/@types/istanbul-lib-coverage | 2.0.6 | MIT | No | [npm registry](https://registry.npmjs.org/@types/istanbul-lib-coverage/-/istanbul-lib-coverage-2.0.6.tgz) |
| @types/json-schema | node_modules/@types/json-schema | 7.0.15 | MIT | No | [npm registry](https://registry.npmjs.org/@types/json-schema/-/json-schema-7.0.15.tgz) |
| @types/json5 | node_modules/@types/json5 | 0.0.29 | MIT | No | [npm registry](https://registry.npmjs.org/@types/json5/-/json5-0.0.29.tgz) |
| @types/jsonfile | node_modules/@types/jsonfile | 6.1.4 | MIT | No | [npm registry](https://registry.npmjs.org/@types/jsonfile/-/jsonfile-6.1.4.tgz) |
| @types/mocha | node_modules/@types/mocha | 10.0.10 | MIT | No | [npm registry](https://registry.npmjs.org/@types/mocha/-/mocha-10.0.10.tgz) |
| @types/ms | node_modules/@types/ms | 2.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/@types/ms/-/ms-2.1.0.tgz) |
| @types/nock | node_modules/@types/nock | 11.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/@types/nock/-/nock-11.1.0.tgz) |
| @types/node | node_modules/@types/node | 26.6.2 | MIT | No | [npm registry](https://registry.npmjs.org/@types/node/-/node-26.6.2.tgz) |
| @types/normalize-package-data | node_modules/@types/normalize-package-data | 2.4.4 | MIT | No | [npm registry](https://registry.npmjs.org/@types/normalize-package-data/-/normalize-package-data-2.4.4.tgz) |
| @types/sinon | node_modules/@types/sinon | 17.0.4 | MIT | No | [npm registry](https://registry.npmjs.org/@types/sinon/-/sinon-17.0.4.tgz) |
| @types/sinon-chai | node_modules/@types/sinon-chai | 4.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/@types/sinon-chai/-/sinon-chai-4.0.0.tgz) |
| @types/sinonjs__fake-timers | node_modules/@types/sinonjs__fake-timers | 15.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/@types/sinonjs__fake-timers/-/sinonjs__fake-timers-15.0.1.tgz) |
| @typescript-eslint/eslint-plugin | node_modules/@typescript-eslint/eslint-plugin | 8.70.0 | MIT | No | [npm registry](https://registry.npmjs.org/@typescript-eslint/eslint-plugin/-/eslint-plugin-8.70.0.tgz) |
| ignore | node_modules/@typescript-eslint/eslint-plugin/node_modules/ignore | 7.0.9 | MIT | No | [npm registry](https://registry.npmjs.org/ignore/-/ignore-7.0.9.tgz) |
| @typescript-eslint/parser | node_modules/@typescript-eslint/parser | 8.70.0 | MIT | No | [npm registry](https://registry.npmjs.org/@typescript-eslint/parser/-/parser-8.70.0.tgz) |
| @typescript-eslint/project-service | node_modules/@typescript-eslint/project-service | 8.70.0 | MIT | No | [npm registry](https://registry.npmjs.org/@typescript-eslint/project-service/-/project-service-8.70.0.tgz) |
| @typescript-eslint/scope-manager | node_modules/@typescript-eslint/scope-manager | 8.70.0 | MIT | No | [npm registry](https://registry.npmjs.org/@typescript-eslint/scope-manager/-/scope-manager-8.70.0.tgz) |
| @typescript-eslint/tsconfig-utils | node_modules/@typescript-eslint/tsconfig-utils | 8.70.0 | MIT | No | [npm registry](https://registry.npmjs.org/@typescript-eslint/tsconfig-utils/-/tsconfig-utils-8.70.0.tgz) |
| @typescript-eslint/type-utils | node_modules/@typescript-eslint/type-utils | 8.70.0 | MIT | No | [npm registry](https://registry.npmjs.org/@typescript-eslint/type-utils/-/type-utils-8.70.0.tgz) |
| @typescript-eslint/types | node_modules/@typescript-eslint/types | 8.70.0 | MIT | No | [npm registry](https://registry.npmjs.org/@typescript-eslint/types/-/types-8.70.0.tgz) |
| @typescript-eslint/typescript-estree | node_modules/@typescript-eslint/typescript-estree | 8.70.0 | MIT | No | [npm registry](https://registry.npmjs.org/@typescript-eslint/typescript-estree/-/typescript-estree-8.70.0.tgz) |
| balanced-match | node_modules/@typescript-eslint/typescript-estree/node_modules/balanced-match | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz) |
| brace-expansion | node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion | 2.1.7 | MIT | No | [npm registry](https://registry.npmjs.org/brace-expansion/-/brace-expansion-2.1.7.tgz) |
| minimatch | node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch | 9.0.9 | ISC | No | [npm registry](https://registry.npmjs.org/minimatch/-/minimatch-9.0.9.tgz) |
| @typescript-eslint/utils | node_modules/@typescript-eslint/utils | 8.70.0 | MIT | No | [npm registry](https://registry.npmjs.org/@typescript-eslint/utils/-/utils-8.70.0.tgz) |
| @typescript-eslint/visitor-keys | node_modules/@typescript-eslint/visitor-keys | 8.70.0 | MIT | No | [npm registry](https://registry.npmjs.org/@typescript-eslint/visitor-keys/-/visitor-keys-8.70.0.tgz) |
| eslint-visitor-keys | node_modules/@typescript-eslint/visitor-keys/node_modules/eslint-visitor-keys | 5.0.1 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-5.0.1.tgz) |
| @unrs/resolver-binding-android-arm-eabi | node_modules/@unrs/resolver-binding-android-arm-eabi | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-android-arm-eabi/-/resolver-binding-android-arm-eabi-1.12.2.tgz) |
| @unrs/resolver-binding-android-arm64 | node_modules/@unrs/resolver-binding-android-arm64 | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-android-arm64/-/resolver-binding-android-arm64-1.12.2.tgz) |
| @unrs/resolver-binding-darwin-arm64 | node_modules/@unrs/resolver-binding-darwin-arm64 | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-darwin-arm64/-/resolver-binding-darwin-arm64-1.12.2.tgz) |
| @unrs/resolver-binding-darwin-x64 | node_modules/@unrs/resolver-binding-darwin-x64 | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-darwin-x64/-/resolver-binding-darwin-x64-1.12.2.tgz) |
| @unrs/resolver-binding-freebsd-x64 | node_modules/@unrs/resolver-binding-freebsd-x64 | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-freebsd-x64/-/resolver-binding-freebsd-x64-1.12.2.tgz) |
| @unrs/resolver-binding-linux-arm-gnueabihf | node_modules/@unrs/resolver-binding-linux-arm-gnueabihf | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-linux-arm-gnueabihf/-/resolver-binding-linux-arm-gnueabihf-1.12.2.tgz) |
| @unrs/resolver-binding-linux-arm-musleabihf | node_modules/@unrs/resolver-binding-linux-arm-musleabihf | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-linux-arm-musleabihf/-/resolver-binding-linux-arm-musleabihf-1.12.2.tgz) |
| @unrs/resolver-binding-linux-arm64-gnu | node_modules/@unrs/resolver-binding-linux-arm64-gnu | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-linux-arm64-gnu/-/resolver-binding-linux-arm64-gnu-1.12.2.tgz) |
| @unrs/resolver-binding-linux-arm64-musl | node_modules/@unrs/resolver-binding-linux-arm64-musl | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-linux-arm64-musl/-/resolver-binding-linux-arm64-musl-1.12.2.tgz) |
| @unrs/resolver-binding-linux-loong64-gnu | node_modules/@unrs/resolver-binding-linux-loong64-gnu | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-linux-loong64-gnu/-/resolver-binding-linux-loong64-gnu-1.12.2.tgz) |
| @unrs/resolver-binding-linux-loong64-musl | node_modules/@unrs/resolver-binding-linux-loong64-musl | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-linux-loong64-musl/-/resolver-binding-linux-loong64-musl-1.12.2.tgz) |
| @unrs/resolver-binding-linux-ppc64-gnu | node_modules/@unrs/resolver-binding-linux-ppc64-gnu | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-linux-ppc64-gnu/-/resolver-binding-linux-ppc64-gnu-1.12.2.tgz) |
| @unrs/resolver-binding-linux-riscv64-gnu | node_modules/@unrs/resolver-binding-linux-riscv64-gnu | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-linux-riscv64-gnu/-/resolver-binding-linux-riscv64-gnu-1.12.2.tgz) |
| @unrs/resolver-binding-linux-riscv64-musl | node_modules/@unrs/resolver-binding-linux-riscv64-musl | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-linux-riscv64-musl/-/resolver-binding-linux-riscv64-musl-1.12.2.tgz) |
| @unrs/resolver-binding-linux-s390x-gnu | node_modules/@unrs/resolver-binding-linux-s390x-gnu | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-linux-s390x-gnu/-/resolver-binding-linux-s390x-gnu-1.12.2.tgz) |
| @unrs/resolver-binding-linux-x64-gnu | node_modules/@unrs/resolver-binding-linux-x64-gnu | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-linux-x64-gnu/-/resolver-binding-linux-x64-gnu-1.12.2.tgz) |
| @unrs/resolver-binding-linux-x64-musl | node_modules/@unrs/resolver-binding-linux-x64-musl | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-linux-x64-musl/-/resolver-binding-linux-x64-musl-1.12.2.tgz) |
| @unrs/resolver-binding-openharmony-arm64 | node_modules/@unrs/resolver-binding-openharmony-arm64 | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-openharmony-arm64/-/resolver-binding-openharmony-arm64-1.12.2.tgz) |
| @unrs/resolver-binding-wasm32-wasi | node_modules/@unrs/resolver-binding-wasm32-wasi | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-wasm32-wasi/-/resolver-binding-wasm32-wasi-1.12.2.tgz) |
| @unrs/resolver-binding-win32-arm64-msvc | node_modules/@unrs/resolver-binding-win32-arm64-msvc | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-win32-arm64-msvc/-/resolver-binding-win32-arm64-msvc-1.12.2.tgz) |
| @unrs/resolver-binding-win32-ia32-msvc | node_modules/@unrs/resolver-binding-win32-ia32-msvc | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-win32-ia32-msvc/-/resolver-binding-win32-ia32-msvc-1.12.2.tgz) |
| @unrs/resolver-binding-win32-x64-msvc | node_modules/@unrs/resolver-binding-win32-x64-msvc | 1.12.2 | MIT | Yes | [npm registry](https://registry.npmjs.org/@unrs/resolver-binding-win32-x64-msvc/-/resolver-binding-win32-x64-msvc-1.12.2.tgz) |
| acorn | node_modules/acorn | 8.18.0 | MIT | No | [npm registry](https://registry.npmjs.org/acorn/-/acorn-8.18.0.tgz) |
| acorn-jsx | node_modules/acorn-jsx | 5.3.2 | MIT | No | [npm registry](https://registry.npmjs.org/acorn-jsx/-/acorn-jsx-5.3.2.tgz) |
| acorn-walk | node_modules/acorn-walk | 8.3.5 | MIT | No | [npm registry](https://registry.npmjs.org/acorn-walk/-/acorn-walk-8.3.5.tgz) |
| ajv | node_modules/ajv | 6.15.0 | MIT | No | [npm registry](https://registry.npmjs.org/ajv/-/ajv-6.15.0.tgz) |
| ansi-colors | node_modules/ansi-colors | 4.1.3 | MIT | No | [npm registry](https://registry.npmjs.org/ansi-colors/-/ansi-colors-4.1.3.tgz) |
| ansi-escapes | node_modules/ansi-escapes | 4.3.2 | MIT | No | [npm registry](https://registry.npmjs.org/ansi-escapes/-/ansi-escapes-4.3.2.tgz) |
| ansi-regex | node_modules/ansi-regex | 5.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/ansi-regex/-/ansi-regex-5.0.1.tgz) |
| ansi-styles | node_modules/ansi-styles | 4.3.0 | MIT | No | [npm registry](https://registry.npmjs.org/ansi-styles/-/ansi-styles-4.3.0.tgz) |
| ansis | node_modules/ansis | 4.4.0 | ISC | No | [npm registry](https://registry.npmjs.org/ansis/-/ansis-4.4.0.tgz) |
| anymatch | node_modules/anymatch | 3.1.3 | ISC | No | [npm registry](https://registry.npmjs.org/anymatch/-/anymatch-3.1.3.tgz) |
| picomatch | node_modules/anymatch/node_modules/picomatch | 2.3.2 | MIT | No | [npm registry](https://registry.npmjs.org/picomatch/-/picomatch-2.3.2.tgz) |
| are-docs-informative | node_modules/are-docs-informative | 0.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/are-docs-informative/-/are-docs-informative-0.0.2.tgz) |
| arg | node_modules/arg | 4.1.3 | MIT | No | [npm registry](https://registry.npmjs.org/arg/-/arg-4.1.3.tgz) |
| argparse | node_modules/argparse | 2.0.1 | Python-2.0 | No | [npm registry](https://registry.npmjs.org/argparse/-/argparse-2.0.1.tgz) |
| array-buffer-byte-length | node_modules/array-buffer-byte-length | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/array-buffer-byte-length/-/array-buffer-byte-length-1.0.2.tgz) |
| array-includes | node_modules/array-includes | 3.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/array-includes/-/array-includes-3.2.0.tgz) |
| array.prototype.findlastindex | node_modules/array.prototype.findlastindex | 1.2.6 | MIT | No | [npm registry](https://registry.npmjs.org/array.prototype.findlastindex/-/array.prototype.findlastindex-1.2.6.tgz) |
| array.prototype.flat | node_modules/array.prototype.flat | 1.3.3 | MIT | No | [npm registry](https://registry.npmjs.org/array.prototype.flat/-/array.prototype.flat-1.3.3.tgz) |
| array.prototype.flatmap | node_modules/array.prototype.flatmap | 1.3.3 | MIT | No | [npm registry](https://registry.npmjs.org/array.prototype.flatmap/-/array.prototype.flatmap-1.3.3.tgz) |
| arraybuffer.prototype.slice | node_modules/arraybuffer.prototype.slice | 1.0.4 | MIT | No | [npm registry](https://registry.npmjs.org/arraybuffer.prototype.slice/-/arraybuffer.prototype.slice-1.0.4.tgz) |
| assertion-error | node_modules/assertion-error | 1.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/assertion-error/-/assertion-error-1.1.0.tgz) |
| async-function | node_modules/async-function | 1.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/async-function/-/async-function-1.0.0.tgz) |
| available-typed-arrays | node_modules/available-typed-arrays | 1.0.7 | MIT | No | [npm registry](https://registry.npmjs.org/available-typed-arrays/-/available-typed-arrays-1.0.7.tgz) |
| balanced-match | node_modules/balanced-match | 4.0.4 | MIT | No | [npm registry](https://registry.npmjs.org/balanced-match/-/balanced-match-4.0.4.tgz) |
| baseline-browser-mapping | node_modules/baseline-browser-mapping | 2.11.23 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/baseline-browser-mapping/-/baseline-browser-mapping-2.11.23.tgz) |
| binary-extensions | node_modules/binary-extensions | 2.3.0 | MIT | No | [npm registry](https://registry.npmjs.org/binary-extensions/-/binary-extensions-2.3.0.tgz) |
| brace-expansion | node_modules/brace-expansion | 5.0.12 | MIT | No | [npm registry](https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.12.tgz) |
| braces | node_modules/braces | 3.0.3 | MIT | No | [npm registry](https://registry.npmjs.org/braces/-/braces-3.0.3.tgz) |
| browser-stdout | node_modules/browser-stdout | 1.3.1 | ISC | No | [npm registry](https://registry.npmjs.org/browser-stdout/-/browser-stdout-1.3.1.tgz) |
| browserslist | node_modules/browserslist | 4.28.9 | MIT | No | [npm registry](https://registry.npmjs.org/browserslist/-/browserslist-4.28.9.tgz) |
| builtin-modules | node_modules/builtin-modules | 3.3.0 | MIT | No | [npm registry](https://registry.npmjs.org/builtin-modules/-/builtin-modules-3.3.0.tgz) |
| bundle-name | node_modules/bundle-name | 4.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/bundle-name/-/bundle-name-4.1.0.tgz) |
| c8 | node_modules/c8 | 7.14.0 | ISC | No | [npm registry](https://registry.npmjs.org/c8/-/c8-7.14.0.tgz) |
| balanced-match | node_modules/c8/node_modules/balanced-match | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz) |
| brace-expansion | node_modules/c8/node_modules/brace-expansion | 1.1.21 | MIT | No | [npm registry](https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.21.tgz) |
| glob | node_modules/c8/node_modules/glob | 7.2.3 | ISC | No | [npm registry](https://registry.npmjs.org/glob/-/glob-7.2.3.tgz) |
| minimatch | node_modules/c8/node_modules/minimatch | 3.1.5 | ISC | No | [npm registry](https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz) |
| rimraf | node_modules/c8/node_modules/rimraf | 3.0.2 | ISC | No | [npm registry](https://registry.npmjs.org/rimraf/-/rimraf-3.0.2.tgz) |
| call-bind | node_modules/call-bind | 1.0.9 | MIT | No | [npm registry](https://registry.npmjs.org/call-bind/-/call-bind-1.0.9.tgz) |
| call-bind-apply-helpers | node_modules/call-bind-apply-helpers | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/call-bind-apply-helpers/-/call-bind-apply-helpers-1.0.2.tgz) |
| call-bound | node_modules/call-bound | 1.0.4 | MIT | No | [npm registry](https://registry.npmjs.org/call-bound/-/call-bound-1.0.4.tgz) |
| callsites | node_modules/callsites | 3.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/callsites/-/callsites-3.1.0.tgz) |
| camelcase | node_modules/camelcase | 6.3.0 | MIT | No | [npm registry](https://registry.npmjs.org/camelcase/-/camelcase-6.3.0.tgz) |
| caniuse-lite | node_modules/caniuse-lite | 1.0.30001810 | CC-BY-4.0 | No | [npm registry](https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001810.tgz) |
| chai | node_modules/chai | 4.5.0 | MIT | No | [npm registry](https://registry.npmjs.org/chai/-/chai-4.5.0.tgz) |
| chai-as-promised | node_modules/chai-as-promised | 8.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/chai-as-promised/-/chai-as-promised-8.0.2.tgz) |
| check-error | node_modules/chai-as-promised/node_modules/check-error | 2.1.3 | MIT | No | [npm registry](https://registry.npmjs.org/check-error/-/check-error-2.1.3.tgz) |
| chalk | node_modules/chalk | 4.1.2 | MIT | No | [npm registry](https://registry.npmjs.org/chalk/-/chalk-4.1.2.tgz) |
| supports-color | node_modules/chalk/node_modules/supports-color | 7.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/supports-color/-/supports-color-7.2.0.tgz) |
| chardet | node_modules/chardet | 2.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/chardet/-/chardet-2.2.0.tgz) |
| check-error | node_modules/check-error | 1.0.3 | MIT | No | [npm registry](https://registry.npmjs.org/check-error/-/check-error-1.0.3.tgz) |
| chokidar | node_modules/chokidar | 3.6.0 | MIT | No | [npm registry](https://registry.npmjs.org/chokidar/-/chokidar-3.6.0.tgz) |
| glob-parent | node_modules/chokidar/node_modules/glob-parent | 5.1.2 | ISC | No | [npm registry](https://registry.npmjs.org/glob-parent/-/glob-parent-5.1.2.tgz) |
| ci-info | node_modules/ci-info | 4.4.0 | MIT | No | [npm registry](https://registry.npmjs.org/ci-info/-/ci-info-4.4.0.tgz) |
| cjs-module-lexer | node_modules/cjs-module-lexer | 2.2.1 | MIT | No | [npm registry](https://registry.npmjs.org/cjs-module-lexer/-/cjs-module-lexer-2.2.1.tgz) |
| clean-regexp | node_modules/clean-regexp | 1.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/clean-regexp/-/clean-regexp-1.0.0.tgz) |
| escape-string-regexp | node_modules/clean-regexp/node_modules/escape-string-regexp | 1.0.5 | MIT | No | [npm registry](https://registry.npmjs.org/escape-string-regexp/-/escape-string-regexp-1.0.5.tgz) |
| clean-stack | node_modules/clean-stack | 3.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/clean-stack/-/clean-stack-3.0.1.tgz) |
| cli-spinners | node_modules/cli-spinners | 2.9.2 | MIT | No | [npm registry](https://registry.npmjs.org/cli-spinners/-/cli-spinners-2.9.2.tgz) |
| cli-width | node_modules/cli-width | 4.1.0 | ISC | No | [npm registry](https://registry.npmjs.org/cli-width/-/cli-width-4.1.0.tgz) |
| cliui | node_modules/cliui | 7.0.4 | ISC | No | [npm registry](https://registry.npmjs.org/cliui/-/cliui-7.0.4.tgz) |
| color-convert | node_modules/color-convert | 2.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/color-convert/-/color-convert-2.0.1.tgz) |
| color-name | node_modules/color-name | 1.1.4 | MIT | No | [npm registry](https://registry.npmjs.org/color-name/-/color-name-1.1.4.tgz) |
| comment-parser | node_modules/comment-parser | 1.4.1 | MIT | No | [npm registry](https://registry.npmjs.org/comment-parser/-/comment-parser-1.4.1.tgz) |
| concat-map | node_modules/concat-map | 0.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/concat-map/-/concat-map-0.0.1.tgz) |
| confusing-browser-globals | node_modules/confusing-browser-globals | 1.0.11 | MIT | No | [npm registry](https://registry.npmjs.org/confusing-browser-globals/-/confusing-browser-globals-1.0.11.tgz) |
| content-type | node_modules/content-type | 1.0.5 | MIT | No | [npm registry](https://registry.npmjs.org/content-type/-/content-type-1.0.5.tgz) |
| convert-source-map | node_modules/convert-source-map | 2.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/convert-source-map/-/convert-source-map-2.0.0.tgz) |
| core-js-compat | node_modules/core-js-compat | 3.50.0 | MIT | No | [npm registry](https://registry.npmjs.org/core-js-compat/-/core-js-compat-3.50.0.tgz) |
| create-require | node_modules/create-require | 1.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/create-require/-/create-require-1.1.1.tgz) |
| data-view-buffer | node_modules/data-view-buffer | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/data-view-buffer/-/data-view-buffer-1.0.2.tgz) |
| data-view-byte-length | node_modules/data-view-byte-length | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/data-view-byte-length/-/data-view-byte-length-1.0.2.tgz) |
| data-view-byte-offset | node_modules/data-view-byte-offset | 1.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/data-view-byte-offset/-/data-view-byte-offset-1.0.1.tgz) |
| decamelize | node_modules/decamelize | 4.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/decamelize/-/decamelize-4.0.0.tgz) |
| deep-eql | node_modules/deep-eql | 4.1.4 | MIT | No | [npm registry](https://registry.npmjs.org/deep-eql/-/deep-eql-4.1.4.tgz) |
| deep-is | node_modules/deep-is | 0.1.4 | MIT | No | [npm registry](https://registry.npmjs.org/deep-is/-/deep-is-0.1.4.tgz) |
| default-browser | node_modules/default-browser | 5.5.1 | MIT | No | [npm registry](https://registry.npmjs.org/default-browser/-/default-browser-5.5.1.tgz) |
| default-browser-id | node_modules/default-browser-id | 5.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/default-browser-id/-/default-browser-id-5.0.1.tgz) |
| define-data-property | node_modules/define-data-property | 1.1.4 | MIT | No | [npm registry](https://registry.npmjs.org/define-data-property/-/define-data-property-1.1.4.tgz) |
| define-lazy-prop | node_modules/define-lazy-prop | 3.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/define-lazy-prop/-/define-lazy-prop-3.0.0.tgz) |
| define-properties | node_modules/define-properties | 1.2.1 | MIT | No | [npm registry](https://registry.npmjs.org/define-properties/-/define-properties-1.2.1.tgz) |
| diff | node_modules/diff | 5.2.2 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/diff/-/diff-5.2.2.tgz) |
| doctrine | node_modules/doctrine | 2.1.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/doctrine/-/doctrine-2.1.0.tgz) |
| dunder-proto | node_modules/dunder-proto | 1.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz) |
| ejs | node_modules/ejs | 6.0.1 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/ejs/-/ejs-6.0.1.tgz) |
| electron-to-chromium | node_modules/electron-to-chromium | 1.5.427 | ISC | No | [npm registry](https://registry.npmjs.org/electron-to-chromium/-/electron-to-chromium-1.5.427.tgz) |
| emoji-regex | node_modules/emoji-regex | 8.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/emoji-regex/-/emoji-regex-8.0.0.tgz) |
| enhanced-resolve | node_modules/enhanced-resolve | 5.25.1 | MIT | No | [npm registry](https://registry.npmjs.org/enhanced-resolve/-/enhanced-resolve-5.25.1.tgz) |
| error-ex | node_modules/error-ex | 1.3.4 | MIT | No | [npm registry](https://registry.npmjs.org/error-ex/-/error-ex-1.3.4.tgz) |
| es-abstract | node_modules/es-abstract | 1.24.2 | MIT | No | [npm registry](https://registry.npmjs.org/es-abstract/-/es-abstract-1.24.2.tgz) |
| es-abstract-get | node_modules/es-abstract-get | 1.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/es-abstract-get/-/es-abstract-get-1.0.0.tgz) |
| es-define-property | node_modules/es-define-property | 1.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/es-define-property/-/es-define-property-1.0.1.tgz) |
| es-errors | node_modules/es-errors | 1.3.0 | MIT | No | [npm registry](https://registry.npmjs.org/es-errors/-/es-errors-1.3.0.tgz) |
| es-module-lexer | node_modules/es-module-lexer | 3.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/es-module-lexer/-/es-module-lexer-3.0.2.tgz) |
| es-object-atoms | node_modules/es-object-atoms | 1.1.2 | MIT | No | [npm registry](https://registry.npmjs.org/es-object-atoms/-/es-object-atoms-1.1.2.tgz) |
| es-set-tostringtag | node_modules/es-set-tostringtag | 2.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/es-set-tostringtag/-/es-set-tostringtag-2.1.0.tgz) |
| es-shim-unscopables | node_modules/es-shim-unscopables | 1.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/es-shim-unscopables/-/es-shim-unscopables-1.1.0.tgz) |
| es-to-primitive | node_modules/es-to-primitive | 1.3.4 | MIT | No | [npm registry](https://registry.npmjs.org/es-to-primitive/-/es-to-primitive-1.3.4.tgz) |
| escalade | node_modules/escalade | 3.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/escalade/-/escalade-3.2.0.tgz) |
| escape-string-regexp | node_modules/escape-string-regexp | 4.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/escape-string-regexp/-/escape-string-regexp-4.0.0.tgz) |
| eslint | node_modules/eslint | 9.39.5 | MIT | No | [npm registry](https://registry.npmjs.org/eslint/-/eslint-9.39.5.tgz) |
| eslint-compat-utils | node_modules/eslint-compat-utils | 0.5.1 | MIT | No | [npm registry](https://registry.npmjs.org/eslint-compat-utils/-/eslint-compat-utils-0.5.1.tgz) |
| eslint-config-oclif | node_modules/eslint-config-oclif | 6.0.179 | MIT | No | [npm registry](https://registry.npmjs.org/eslint-config-oclif/-/eslint-config-oclif-6.0.179.tgz) |
| eslint-config-xo | node_modules/eslint-config-xo | 0.49.0 | MIT | No | [npm registry](https://registry.npmjs.org/eslint-config-xo/-/eslint-config-xo-0.49.0.tgz) |
| eslint-config-xo-space | node_modules/eslint-config-xo-space | 0.35.0 | MIT | No | [npm registry](https://registry.npmjs.org/eslint-config-xo-space/-/eslint-config-xo-space-0.35.0.tgz) |
| eslint-config-xo | node_modules/eslint-config-xo-space/node_modules/eslint-config-xo | 0.44.0 | MIT | No | [npm registry](https://registry.npmjs.org/eslint-config-xo/-/eslint-config-xo-0.44.0.tgz) |
| @stylistic/eslint-plugin | node_modules/eslint-config-xo/node_modules/@stylistic/eslint-plugin | 5.10.0 | MIT | No | [npm registry](https://registry.npmjs.org/@stylistic/eslint-plugin/-/eslint-plugin-5.10.0.tgz) |
| globals | node_modules/eslint-config-xo/node_modules/globals | 16.5.0 | MIT | No | [npm registry](https://registry.npmjs.org/globals/-/globals-16.5.0.tgz) |
| eslint-import-resolver-node | node_modules/eslint-import-resolver-node | 0.3.10 | MIT | No | [npm registry](https://registry.npmjs.org/eslint-import-resolver-node/-/eslint-import-resolver-node-0.3.10.tgz) |
| debug | node_modules/eslint-import-resolver-node/node_modules/debug | 3.2.7 | MIT | No | [npm registry](https://registry.npmjs.org/debug/-/debug-3.2.7.tgz) |
| eslint-import-resolver-typescript | node_modules/eslint-import-resolver-typescript | 3.10.1 | ISC | No | [npm registry](https://registry.npmjs.org/eslint-import-resolver-typescript/-/eslint-import-resolver-typescript-3.10.1.tgz) |
| eslint-module-utils | node_modules/eslint-module-utils | 2.14.0 | MIT | No | [npm registry](https://registry.npmjs.org/eslint-module-utils/-/eslint-module-utils-2.14.0.tgz) |
| debug | node_modules/eslint-module-utils/node_modules/debug | 3.2.7 | MIT | No | [npm registry](https://registry.npmjs.org/debug/-/debug-3.2.7.tgz) |
| eslint-plugin-es-x | node_modules/eslint-plugin-es-x | 7.8.0 | MIT | No | [npm registry](https://registry.npmjs.org/eslint-plugin-es-x/-/eslint-plugin-es-x-7.8.0.tgz) |
| eslint-plugin-import | node_modules/eslint-plugin-import | 2.32.0 | MIT | No | [npm registry](https://registry.npmjs.org/eslint-plugin-import/-/eslint-plugin-import-2.32.0.tgz) |
| balanced-match | node_modules/eslint-plugin-import/node_modules/balanced-match | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz) |
| brace-expansion | node_modules/eslint-plugin-import/node_modules/brace-expansion | 1.1.21 | MIT | No | [npm registry](https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.21.tgz) |
| debug | node_modules/eslint-plugin-import/node_modules/debug | 3.2.7 | MIT | No | [npm registry](https://registry.npmjs.org/debug/-/debug-3.2.7.tgz) |
| minimatch | node_modules/eslint-plugin-import/node_modules/minimatch | 3.1.5 | ISC | No | [npm registry](https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz) |
| semver | node_modules/eslint-plugin-import/node_modules/semver | 6.3.1 | ISC | No | [npm registry](https://registry.npmjs.org/semver/-/semver-6.3.1.tgz) |
| eslint-plugin-jsdoc | node_modules/eslint-plugin-jsdoc | 50.8.0 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/eslint-plugin-jsdoc/-/eslint-plugin-jsdoc-50.8.0.tgz) |
| eslint-plugin-mocha | node_modules/eslint-plugin-mocha | 10.5.0 | MIT | No | [npm registry](https://registry.npmjs.org/eslint-plugin-mocha/-/eslint-plugin-mocha-10.5.0.tgz) |
| globals | node_modules/eslint-plugin-mocha/node_modules/globals | 13.24.0 | MIT | No | [npm registry](https://registry.npmjs.org/globals/-/globals-13.24.0.tgz) |
| type-fest | node_modules/eslint-plugin-mocha/node_modules/type-fest | 0.20.2 | (MIT OR CC0-1.0) | No | [npm registry](https://registry.npmjs.org/type-fest/-/type-fest-0.20.2.tgz) |
| eslint-plugin-n | node_modules/eslint-plugin-n | 17.24.0 | MIT | No | [npm registry](https://registry.npmjs.org/eslint-plugin-n/-/eslint-plugin-n-17.24.0.tgz) |
| globals | node_modules/eslint-plugin-n/node_modules/globals | 15.15.0 | MIT | No | [npm registry](https://registry.npmjs.org/globals/-/globals-15.15.0.tgz) |
| eslint-plugin-perfectionist | node_modules/eslint-plugin-perfectionist | 4.15.1 | MIT | No | [npm registry](https://registry.npmjs.org/eslint-plugin-perfectionist/-/eslint-plugin-perfectionist-4.15.1.tgz) |
| eslint-plugin-unicorn | node_modules/eslint-plugin-unicorn | 56.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/eslint-plugin-unicorn/-/eslint-plugin-unicorn-56.0.1.tgz) |
| globals | node_modules/eslint-plugin-unicorn/node_modules/globals | 15.15.0 | MIT | No | [npm registry](https://registry.npmjs.org/globals/-/globals-15.15.0.tgz) |
| eslint-scope | node_modules/eslint-scope | 8.4.0 | BSD-2-Clause | No | [npm registry](https://registry.npmjs.org/eslint-scope/-/eslint-scope-8.4.0.tgz) |
| eslint-utils | node_modules/eslint-utils | 3.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/eslint-utils/-/eslint-utils-3.0.0.tgz) |
| eslint-visitor-keys | node_modules/eslint-utils/node_modules/eslint-visitor-keys | 2.1.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-2.1.0.tgz) |
| eslint-visitor-keys | node_modules/eslint-visitor-keys | 4.2.1 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-4.2.1.tgz) |
| balanced-match | node_modules/eslint/node_modules/balanced-match | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz) |
| brace-expansion | node_modules/eslint/node_modules/brace-expansion | 1.1.21 | MIT | No | [npm registry](https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.21.tgz) |
| minimatch | node_modules/eslint/node_modules/minimatch | 3.1.5 | ISC | No | [npm registry](https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz) |
| espree | node_modules/espree | 10.4.0 | BSD-2-Clause | No | [npm registry](https://registry.npmjs.org/espree/-/espree-10.4.0.tgz) |
| esquery | node_modules/esquery | 1.7.0 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/esquery/-/esquery-1.7.0.tgz) |
| esrecurse | node_modules/esrecurse | 4.3.0 | BSD-2-Clause | No | [npm registry](https://registry.npmjs.org/esrecurse/-/esrecurse-4.3.0.tgz) |
| estraverse | node_modules/estraverse | 5.3.0 | BSD-2-Clause | No | [npm registry](https://registry.npmjs.org/estraverse/-/estraverse-5.3.0.tgz) |
| esutils | node_modules/esutils | 2.0.3 | BSD-2-Clause | No | [npm registry](https://registry.npmjs.org/esutils/-/esutils-2.0.3.tgz) |
| fast-deep-equal | node_modules/fast-deep-equal | 3.1.3 | MIT | No | [npm registry](https://registry.npmjs.org/fast-deep-equal/-/fast-deep-equal-3.1.3.tgz) |
| fast-json-stable-stringify | node_modules/fast-json-stable-stringify | 2.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/fast-json-stable-stringify/-/fast-json-stable-stringify-2.1.0.tgz) |
| fast-levenshtein | node_modules/fast-levenshtein | 2.0.6 | MIT | No | [npm registry](https://registry.npmjs.org/fast-levenshtein/-/fast-levenshtein-2.0.6.tgz) |
| fdir | node_modules/fdir | 6.5.0 | MIT | No | [npm registry](https://registry.npmjs.org/fdir/-/fdir-6.5.0.tgz) |
| file-entry-cache | node_modules/file-entry-cache | 8.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/file-entry-cache/-/file-entry-cache-8.0.0.tgz) |
| fill-range | node_modules/fill-range | 7.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/fill-range/-/fill-range-7.1.1.tgz) |
| find-up | node_modules/find-up | 5.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/find-up/-/find-up-5.0.0.tgz) |
| flat | node_modules/flat | 5.0.2 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/flat/-/flat-5.0.2.tgz) |
| flat-cache | node_modules/flat-cache | 4.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/flat-cache/-/flat-cache-4.0.1.tgz) |
| flatted | node_modules/flatted | 3.4.4 | ISC | No | [npm registry](https://registry.npmjs.org/flatted/-/flatted-3.4.4.tgz) |
| for-each | node_modules/for-each | 0.3.5 | MIT | No | [npm registry](https://registry.npmjs.org/for-each/-/for-each-0.3.5.tgz) |
| foreground-child | node_modules/foreground-child | 2.0.0 | ISC | No | [npm registry](https://registry.npmjs.org/foreground-child/-/foreground-child-2.0.0.tgz) |
| signal-exit | node_modules/foreground-child/node_modules/signal-exit | 3.0.7 | ISC | No | [npm registry](https://registry.npmjs.org/signal-exit/-/signal-exit-3.0.7.tgz) |
| fs-extra | node_modules/fs-extra | 11.4.0 | MIT | No | [npm registry](https://registry.npmjs.org/fs-extra/-/fs-extra-11.4.0.tgz) |
| fs.realpath | node_modules/fs.realpath | 1.0.0 | ISC | No | [npm registry](https://registry.npmjs.org/fs.realpath/-/fs.realpath-1.0.0.tgz) |
| fsevents | node_modules/fsevents | 2.3.3 | MIT | Yes | [npm registry](https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz) |
| function-bind | node_modules/function-bind | 1.1.2 | MIT | No | [npm registry](https://registry.npmjs.org/function-bind/-/function-bind-1.1.2.tgz) |
| function.prototype.name | node_modules/function.prototype.name | 1.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/function.prototype.name/-/function.prototype.name-1.2.0.tgz) |
| functions-have-names | node_modules/functions-have-names | 1.2.3 | MIT | No | [npm registry](https://registry.npmjs.org/functions-have-names/-/functions-have-names-1.2.3.tgz) |
| generator-function | node_modules/generator-function | 2.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/generator-function/-/generator-function-2.0.1.tgz) |
| get-caller-file | node_modules/get-caller-file | 2.0.5 | ISC | No | [npm registry](https://registry.npmjs.org/get-caller-file/-/get-caller-file-2.0.5.tgz) |
| get-func-name | node_modules/get-func-name | 2.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/get-func-name/-/get-func-name-2.0.2.tgz) |
| get-intrinsic | node_modules/get-intrinsic | 1.3.0 | MIT | No | [npm registry](https://registry.npmjs.org/get-intrinsic/-/get-intrinsic-1.3.0.tgz) |
| get-package-type | node_modules/get-package-type | 0.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/get-package-type/-/get-package-type-0.1.0.tgz) |
| get-proto | node_modules/get-proto | 1.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/get-proto/-/get-proto-1.0.1.tgz) |
| get-symbol-description | node_modules/get-symbol-description | 1.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/get-symbol-description/-/get-symbol-description-1.1.0.tgz) |
| get-tsconfig | node_modules/get-tsconfig | 4.14.3 | MIT | No | [npm registry](https://registry.npmjs.org/get-tsconfig/-/get-tsconfig-4.14.3.tgz) |
| glob | node_modules/glob | 8.1.0 | ISC | No | [npm registry](https://registry.npmjs.org/glob/-/glob-8.1.0.tgz) |
| glob-parent | node_modules/glob-parent | 6.0.2 | ISC | No | [npm registry](https://registry.npmjs.org/glob-parent/-/glob-parent-6.0.2.tgz) |
| balanced-match | node_modules/glob/node_modules/balanced-match | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz) |
| brace-expansion | node_modules/glob/node_modules/brace-expansion | 2.1.7 | MIT | No | [npm registry](https://registry.npmjs.org/brace-expansion/-/brace-expansion-2.1.7.tgz) |
| minimatch | node_modules/glob/node_modules/minimatch | 5.1.9 | ISC | No | [npm registry](https://registry.npmjs.org/minimatch/-/minimatch-5.1.9.tgz) |
| globals | node_modules/globals | 14.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/globals/-/globals-14.0.0.tgz) |
| globalthis | node_modules/globalthis | 1.0.4 | MIT | No | [npm registry](https://registry.npmjs.org/globalthis/-/globalthis-1.0.4.tgz) |
| globrex | node_modules/globrex | 0.1.2 | MIT | No | [npm registry](https://registry.npmjs.org/globrex/-/globrex-0.1.2.tgz) |
| gopd | node_modules/gopd | 1.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/gopd/-/gopd-1.2.0.tgz) |
| graceful-fs | node_modules/graceful-fs | 4.2.11 | ISC | No | [npm registry](https://registry.npmjs.org/graceful-fs/-/graceful-fs-4.2.11.tgz) |
| has-bigints | node_modules/has-bigints | 1.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/has-bigints/-/has-bigints-1.1.0.tgz) |
| has-flag | node_modules/has-flag | 4.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz) |
| has-property-descriptors | node_modules/has-property-descriptors | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/has-property-descriptors/-/has-property-descriptors-1.0.2.tgz) |
| has-proto | node_modules/has-proto | 1.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/has-proto/-/has-proto-1.2.0.tgz) |
| has-symbols | node_modules/has-symbols | 1.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/has-symbols/-/has-symbols-1.1.0.tgz) |
| has-tostringtag | node_modules/has-tostringtag | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/has-tostringtag/-/has-tostringtag-1.0.2.tgz) |
| hasown | node_modules/hasown | 2.0.4 | MIT | No | [npm registry](https://registry.npmjs.org/hasown/-/hasown-2.0.4.tgz) |
| he | node_modules/he | 1.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/he/-/he-1.2.0.tgz) |
| hosted-git-info | node_modules/hosted-git-info | 2.8.9 | ISC | No | [npm registry](https://registry.npmjs.org/hosted-git-info/-/hosted-git-info-2.8.9.tgz) |
| html-escaper | node_modules/html-escaper | 2.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/html-escaper/-/html-escaper-2.0.2.tgz) |
| iconv-lite | node_modules/iconv-lite | 0.7.3 | MIT | No | [npm registry](https://registry.npmjs.org/iconv-lite/-/iconv-lite-0.7.3.tgz) |
| ignore | node_modules/ignore | 5.3.2 | MIT | No | [npm registry](https://registry.npmjs.org/ignore/-/ignore-5.3.2.tgz) |
| import-fresh | node_modules/import-fresh | 3.3.1 | MIT | No | [npm registry](https://registry.npmjs.org/import-fresh/-/import-fresh-3.3.1.tgz) |
| import-in-the-middle | node_modules/import-in-the-middle | 3.5.1 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/import-in-the-middle/-/import-in-the-middle-3.5.1.tgz) |
| imurmurhash | node_modules/imurmurhash | 0.1.4 | MIT | No | [npm registry](https://registry.npmjs.org/imurmurhash/-/imurmurhash-0.1.4.tgz) |
| indent-string | node_modules/indent-string | 4.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/indent-string/-/indent-string-4.0.0.tgz) |
| inflight | node_modules/inflight | 1.0.6 | ISC | No | [npm registry](https://registry.npmjs.org/inflight/-/inflight-1.0.6.tgz) |
| inherits | node_modules/inherits | 2.0.4 | ISC | No | [npm registry](https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz) |
| inquirer | node_modules/inquirer | 12.11.1 | MIT | No | [npm registry](https://registry.npmjs.org/inquirer/-/inquirer-12.11.1.tgz) |
| internal-slot | node_modules/internal-slot | 1.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/internal-slot/-/internal-slot-1.1.0.tgz) |
| is-array-buffer | node_modules/is-array-buffer | 3.0.5 | MIT | No | [npm registry](https://registry.npmjs.org/is-array-buffer/-/is-array-buffer-3.0.5.tgz) |
| is-arrayish | node_modules/is-arrayish | 0.2.1 | MIT | No | [npm registry](https://registry.npmjs.org/is-arrayish/-/is-arrayish-0.2.1.tgz) |
| is-async-function | node_modules/is-async-function | 2.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/is-async-function/-/is-async-function-2.1.1.tgz) |
| is-bigint | node_modules/is-bigint | 1.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-bigint/-/is-bigint-1.1.0.tgz) |
| is-binary-path | node_modules/is-binary-path | 2.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-binary-path/-/is-binary-path-2.1.0.tgz) |
| is-boolean-object | node_modules/is-boolean-object | 1.2.2 | MIT | No | [npm registry](https://registry.npmjs.org/is-boolean-object/-/is-boolean-object-1.2.2.tgz) |
| is-builtin-module | node_modules/is-builtin-module | 3.2.1 | MIT | No | [npm registry](https://registry.npmjs.org/is-builtin-module/-/is-builtin-module-3.2.1.tgz) |
| is-bun-module | node_modules/is-bun-module | 2.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-bun-module/-/is-bun-module-2.0.0.tgz) |
| is-callable | node_modules/is-callable | 1.2.7 | MIT | No | [npm registry](https://registry.npmjs.org/is-callable/-/is-callable-1.2.7.tgz) |
| is-core-module | node_modules/is-core-module | 2.16.2 | MIT | No | [npm registry](https://registry.npmjs.org/is-core-module/-/is-core-module-2.16.2.tgz) |
| is-data-view | node_modules/is-data-view | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/is-data-view/-/is-data-view-1.0.2.tgz) |
| is-date-object | node_modules/is-date-object | 1.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-date-object/-/is-date-object-1.1.0.tgz) |
| is-docker | node_modules/is-docker | 3.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-docker/-/is-docker-3.0.0.tgz) |
| is-document.all | node_modules/is-document.all | 1.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-document.all/-/is-document.all-1.0.0.tgz) |
| is-extglob | node_modules/is-extglob | 2.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/is-extglob/-/is-extglob-2.1.1.tgz) |
| is-finalizationregistry | node_modules/is-finalizationregistry | 1.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/is-finalizationregistry/-/is-finalizationregistry-1.1.1.tgz) |
| is-fullwidth-code-point | node_modules/is-fullwidth-code-point | 3.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-fullwidth-code-point/-/is-fullwidth-code-point-3.0.0.tgz) |
| is-generator-function | node_modules/is-generator-function | 1.1.2 | MIT | No | [npm registry](https://registry.npmjs.org/is-generator-function/-/is-generator-function-1.1.2.tgz) |
| is-glob | node_modules/is-glob | 4.0.3 | MIT | No | [npm registry](https://registry.npmjs.org/is-glob/-/is-glob-4.0.3.tgz) |
| is-in-ssh | node_modules/is-in-ssh | 1.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-in-ssh/-/is-in-ssh-1.0.0.tgz) |
| is-inside-container | node_modules/is-inside-container | 1.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-inside-container/-/is-inside-container-1.0.0.tgz) |
| is-map | node_modules/is-map | 2.0.3 | MIT | No | [npm registry](https://registry.npmjs.org/is-map/-/is-map-2.0.3.tgz) |
| is-negative-zero | node_modules/is-negative-zero | 2.0.3 | MIT | No | [npm registry](https://registry.npmjs.org/is-negative-zero/-/is-negative-zero-2.0.3.tgz) |
| is-node-process | node_modules/is-node-process | 1.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-node-process/-/is-node-process-1.2.0.tgz) |
| is-number | node_modules/is-number | 7.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz) |
| is-number-object | node_modules/is-number-object | 1.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/is-number-object/-/is-number-object-1.1.1.tgz) |
| is-regex | node_modules/is-regex | 1.2.1 | MIT | No | [npm registry](https://registry.npmjs.org/is-regex/-/is-regex-1.2.1.tgz) |
| is-retry-allowed | node_modules/is-retry-allowed | 2.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-retry-allowed/-/is-retry-allowed-2.2.0.tgz) |
| is-set | node_modules/is-set | 2.0.3 | MIT | No | [npm registry](https://registry.npmjs.org/is-set/-/is-set-2.0.3.tgz) |
| is-shared-array-buffer | node_modules/is-shared-array-buffer | 1.0.4 | MIT | No | [npm registry](https://registry.npmjs.org/is-shared-array-buffer/-/is-shared-array-buffer-1.0.4.tgz) |
| is-stream | node_modules/is-stream | 2.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/is-stream/-/is-stream-2.0.1.tgz) |
| is-string | node_modules/is-string | 1.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/is-string/-/is-string-1.1.1.tgz) |
| is-symbol | node_modules/is-symbol | 1.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/is-symbol/-/is-symbol-1.1.1.tgz) |
| is-typed-array | node_modules/is-typed-array | 1.1.15 | MIT | No | [npm registry](https://registry.npmjs.org/is-typed-array/-/is-typed-array-1.1.15.tgz) |
| is-weakmap | node_modules/is-weakmap | 2.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/is-weakmap/-/is-weakmap-2.0.2.tgz) |
| is-weakref | node_modules/is-weakref | 1.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/is-weakref/-/is-weakref-1.1.1.tgz) |
| is-weakset | node_modules/is-weakset | 2.0.4 | MIT | No | [npm registry](https://registry.npmjs.org/is-weakset/-/is-weakset-2.0.4.tgz) |
| is-wsl | node_modules/is-wsl | 3.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/is-wsl/-/is-wsl-3.1.1.tgz) |
| isarray | node_modules/isarray | 2.0.5 | MIT | No | [npm registry](https://registry.npmjs.org/isarray/-/isarray-2.0.5.tgz) |
| istanbul-lib-coverage | node_modules/istanbul-lib-coverage | 3.2.2 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/istanbul-lib-coverage/-/istanbul-lib-coverage-3.2.2.tgz) |
| istanbul-lib-report | node_modules/istanbul-lib-report | 3.0.1 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/istanbul-lib-report/-/istanbul-lib-report-3.0.1.tgz) |
| supports-color | node_modules/istanbul-lib-report/node_modules/supports-color | 7.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/supports-color/-/supports-color-7.2.0.tgz) |
| istanbul-reports | node_modules/istanbul-reports | 3.2.0 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/istanbul-reports/-/istanbul-reports-3.2.0.tgz) |
| js-tokens | node_modules/js-tokens | 4.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/js-tokens/-/js-tokens-4.0.0.tgz) |
| js-yaml | node_modules/js-yaml | 4.3.2 | MIT | No | [npm registry](https://registry.npmjs.org/js-yaml/-/js-yaml-4.3.2.tgz) |
| jsdoc-type-pratt-parser | node_modules/jsdoc-type-pratt-parser | 4.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/jsdoc-type-pratt-parser/-/jsdoc-type-pratt-parser-4.1.0.tgz) |
| jsesc | node_modules/jsesc | 3.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/jsesc/-/jsesc-3.1.0.tgz) |
| json-buffer | node_modules/json-buffer | 3.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/json-buffer/-/json-buffer-3.0.1.tgz) |
| json-parse-even-better-errors | node_modules/json-parse-even-better-errors | 2.3.1 | MIT | No | [npm registry](https://registry.npmjs.org/json-parse-even-better-errors/-/json-parse-even-better-errors-2.3.1.tgz) |
| json-schema-traverse | node_modules/json-schema-traverse | 0.4.1 | MIT | No | [npm registry](https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-0.4.1.tgz) |
| json-stable-stringify-without-jsonify | node_modules/json-stable-stringify-without-jsonify | 1.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/json-stable-stringify-without-jsonify/-/json-stable-stringify-without-jsonify-1.0.1.tgz) |
| json-stringify-safe | node_modules/json-stringify-safe | 5.0.1 | ISC | No | [npm registry](https://registry.npmjs.org/json-stringify-safe/-/json-stringify-safe-5.0.1.tgz) |
| json5 | node_modules/json5 | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/json5/-/json5-1.0.2.tgz) |
| jsonfile | node_modules/jsonfile | 6.2.1 | MIT | No | [npm registry](https://registry.npmjs.org/jsonfile/-/jsonfile-6.2.1.tgz) |
| just-extend | node_modules/just-extend | 6.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/just-extend/-/just-extend-6.2.0.tgz) |
| keyv | node_modules/keyv | 4.5.4 | MIT | No | [npm registry](https://registry.npmjs.org/keyv/-/keyv-4.5.4.tgz) |
| levn | node_modules/levn | 0.4.1 | MIT | No | [npm registry](https://registry.npmjs.org/levn/-/levn-0.4.1.tgz) |
| lilconfig | node_modules/lilconfig | 3.1.3 | MIT | No | [npm registry](https://registry.npmjs.org/lilconfig/-/lilconfig-3.1.3.tgz) |
| lines-and-columns | node_modules/lines-and-columns | 1.2.4 | MIT | No | [npm registry](https://registry.npmjs.org/lines-and-columns/-/lines-and-columns-1.2.4.tgz) |
| locate-path | node_modules/locate-path | 6.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/locate-path/-/locate-path-6.0.0.tgz) |
| lodash.merge | node_modules/lodash.merge | 4.6.2 | MIT | No | [npm registry](https://registry.npmjs.org/lodash.merge/-/lodash.merge-4.6.2.tgz) |
| log-symbols | node_modules/log-symbols | 4.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/log-symbols/-/log-symbols-4.1.0.tgz) |
| is-unicode-supported | node_modules/log-symbols/node_modules/is-unicode-supported | 0.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-unicode-supported/-/is-unicode-supported-0.1.0.tgz) |
| loupe | node_modules/loupe | 2.3.7 | MIT | No | [npm registry](https://registry.npmjs.org/loupe/-/loupe-2.3.7.tgz) |
| lru-cache | node_modules/lru-cache | 11.5.2 | BlueOak-1.0.0 | No | [npm registry](https://registry.npmjs.org/lru-cache/-/lru-cache-11.5.2.tgz) |
| make-dir | node_modules/make-dir | 4.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/make-dir/-/make-dir-4.0.0.tgz) |
| make-error | node_modules/make-error | 1.3.6 | ISC | No | [npm registry](https://registry.npmjs.org/make-error/-/make-error-1.3.6.tgz) |
| math-intrinsics | node_modules/math-intrinsics | 1.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz) |
| mdn-data | node_modules/mdn-data | 2.23.0 | CC0-1.0 | No | [npm registry](https://registry.npmjs.org/mdn-data/-/mdn-data-2.23.0.tgz) |
| min-indent | node_modules/min-indent | 1.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/min-indent/-/min-indent-1.0.1.tgz) |
| minimatch | node_modules/minimatch | 10.2.6 | BlueOak-1.0.0 | No | [npm registry](https://registry.npmjs.org/minimatch/-/minimatch-10.2.6.tgz) |
| minimist | node_modules/minimist | 1.2.8 | MIT | No | [npm registry](https://registry.npmjs.org/minimist/-/minimist-1.2.8.tgz) |
| minipass | node_modules/minipass | 7.1.3 | BlueOak-1.0.0 | No | [npm registry](https://registry.npmjs.org/minipass/-/minipass-7.1.3.tgz) |
| mocha | node_modules/mocha | 10.8.2 | MIT | No | [npm registry](https://registry.npmjs.org/mocha/-/mocha-10.8.2.tgz) |
| balanced-match | node_modules/mocha/node_modules/balanced-match | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz) |
| brace-expansion | node_modules/mocha/node_modules/brace-expansion | 2.1.7 | MIT | No | [npm registry](https://registry.npmjs.org/brace-expansion/-/brace-expansion-2.1.7.tgz) |
| minimatch | node_modules/mocha/node_modules/minimatch | 5.1.9 | ISC | No | [npm registry](https://registry.npmjs.org/minimatch/-/minimatch-5.1.9.tgz) |
| module-details-from-path | node_modules/module-details-from-path | 1.0.4 | MIT | No | [npm registry](https://registry.npmjs.org/module-details-from-path/-/module-details-from-path-1.0.4.tgz) |
| mute-stream | node_modules/mute-stream | 2.0.0 | ISC | No | [npm registry](https://registry.npmjs.org/mute-stream/-/mute-stream-2.0.0.tgz) |
| napi-postinstall | node_modules/napi-postinstall | 0.3.4 | MIT | No | [npm registry](https://registry.npmjs.org/napi-postinstall/-/napi-postinstall-0.3.4.tgz) |
| natural-compare | node_modules/natural-compare | 1.4.0 | MIT | No | [npm registry](https://registry.npmjs.org/natural-compare/-/natural-compare-1.4.0.tgz) |
| natural-orderby | node_modules/natural-orderby | 5.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/natural-orderby/-/natural-orderby-5.0.0.tgz) |
| nise | node_modules/nise | 6.1.5 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/nise/-/nise-6.1.5.tgz) |
| @sinonjs/fake-timers | node_modules/nise/node_modules/@sinonjs/fake-timers | 15.4.0 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/@sinonjs/fake-timers/-/fake-timers-15.4.0.tgz) |
| nock | node_modules/nock | 14.0.17 | MIT | No | [npm registry](https://registry.npmjs.org/nock/-/nock-14.0.17.tgz) |
| node-exports-info | node_modules/node-exports-info | 1.6.2 | MIT | No | [npm registry](https://registry.npmjs.org/node-exports-info/-/node-exports-info-1.6.2.tgz) |
| semver | node_modules/node-exports-info/node_modules/semver | 6.3.1 | ISC | No | [npm registry](https://registry.npmjs.org/semver/-/semver-6.3.1.tgz) |
| node-releases | node_modules/node-releases | 2.0.55 | MIT | No | [npm registry](https://registry.npmjs.org/node-releases/-/node-releases-2.0.55.tgz) |
| normalize-package-data | node_modules/normalize-package-data | 2.5.0 | BSD-2-Clause | No | [npm registry](https://registry.npmjs.org/normalize-package-data/-/normalize-package-data-2.5.0.tgz) |
| resolve | node_modules/normalize-package-data/node_modules/resolve | 1.22.12 | MIT | No | [npm registry](https://registry.npmjs.org/resolve/-/resolve-1.22.12.tgz) |
| semver | node_modules/normalize-package-data/node_modules/semver | 5.7.2 | ISC | No | [npm registry](https://registry.npmjs.org/semver/-/semver-5.7.2.tgz) |
| normalize-path | node_modules/normalize-path | 3.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/normalize-path/-/normalize-path-3.0.0.tgz) |
| object-inspect | node_modules/object-inspect | 1.13.4 | MIT | No | [npm registry](https://registry.npmjs.org/object-inspect/-/object-inspect-1.13.4.tgz) |
| object-keys | node_modules/object-keys | 1.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/object-keys/-/object-keys-1.1.1.tgz) |
| object.assign | node_modules/object.assign | 4.1.7 | MIT | No | [npm registry](https://registry.npmjs.org/object.assign/-/object.assign-4.1.7.tgz) |
| object.entries | node_modules/object.entries | 1.1.9 | MIT | No | [npm registry](https://registry.npmjs.org/object.entries/-/object.entries-1.1.9.tgz) |
| object.fromentries | node_modules/object.fromentries | 2.0.8 | MIT | No | [npm registry](https://registry.npmjs.org/object.fromentries/-/object.fromentries-2.0.8.tgz) |
| object.groupby | node_modules/object.groupby | 1.0.3 | MIT | No | [npm registry](https://registry.npmjs.org/object.groupby/-/object.groupby-1.0.3.tgz) |
| object.values | node_modules/object.values | 1.2.1 | MIT | No | [npm registry](https://registry.npmjs.org/object.values/-/object.values-1.2.1.tgz) |
| once | node_modules/once | 1.4.0 | ISC | No | [npm registry](https://registry.npmjs.org/once/-/once-1.4.0.tgz) |
| open | node_modules/open | 11.0.4 | MIT | No | [npm registry](https://registry.npmjs.org/open/-/open-11.0.4.tgz) |
| wsl-utils | node_modules/open/node_modules/wsl-utils | 1.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/wsl-utils/-/wsl-utils-1.0.0.tgz) |
| powershell-utils | node_modules/open/node_modules/wsl-utils/node_modules/powershell-utils | 0.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/powershell-utils/-/powershell-utils-0.1.0.tgz) |
| optionator | node_modules/optionator | 0.9.4 | MIT | No | [npm registry](https://registry.npmjs.org/optionator/-/optionator-0.9.4.tgz) |
| outvariant | node_modules/outvariant | 1.4.3 | MIT | No | [npm registry](https://registry.npmjs.org/outvariant/-/outvariant-1.4.3.tgz) |
| own-keys | node_modules/own-keys | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/own-keys/-/own-keys-1.0.2.tgz) |
| p-limit | node_modules/p-limit | 3.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/p-limit/-/p-limit-3.1.0.tgz) |
| p-locate | node_modules/p-locate | 5.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/p-locate/-/p-locate-5.0.0.tgz) |
| p-try | node_modules/p-try | 2.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/p-try/-/p-try-2.2.0.tgz) |
| package-json-from-dist | node_modules/package-json-from-dist | 1.0.1 | BlueOak-1.0.0 | No | [npm registry](https://registry.npmjs.org/package-json-from-dist/-/package-json-from-dist-1.0.1.tgz) |
| parent-module | node_modules/parent-module | 1.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/parent-module/-/parent-module-1.0.1.tgz) |
| parse-imports-exports | node_modules/parse-imports-exports | 0.2.4 | MIT | No | [npm registry](https://registry.npmjs.org/parse-imports-exports/-/parse-imports-exports-0.2.4.tgz) |
| parse-json | node_modules/parse-json | 5.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/parse-json/-/parse-json-5.2.0.tgz) |
| parse-statements | node_modules/parse-statements | 1.0.11 | MIT | No | [npm registry](https://registry.npmjs.org/parse-statements/-/parse-statements-1.0.11.tgz) |
| path-exists | node_modules/path-exists | 4.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/path-exists/-/path-exists-4.0.0.tgz) |
| path-is-absolute | node_modules/path-is-absolute | 1.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/path-is-absolute/-/path-is-absolute-1.0.1.tgz) |
| path-parse | node_modules/path-parse | 1.0.7 | MIT | No | [npm registry](https://registry.npmjs.org/path-parse/-/path-parse-1.0.7.tgz) |
| path-scurry | node_modules/path-scurry | 2.0.2 | BlueOak-1.0.0 | No | [npm registry](https://registry.npmjs.org/path-scurry/-/path-scurry-2.0.2.tgz) |
| path-to-regexp | node_modules/path-to-regexp | 8.4.2 | MIT | No | [npm registry](https://registry.npmjs.org/path-to-regexp/-/path-to-regexp-8.4.2.tgz) |
| pathval | node_modules/pathval | 1.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/pathval/-/pathval-1.1.1.tgz) |
| picocolors | node_modules/picocolors | 1.1.1 | ISC | No | [npm registry](https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz) |
| picomatch | node_modules/picomatch | 4.0.7 | MIT | No | [npm registry](https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz) |
| pluralize | node_modules/pluralize | 8.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/pluralize/-/pluralize-8.0.0.tgz) |
| possible-typed-array-names | node_modules/possible-typed-array-names | 1.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/possible-typed-array-names/-/possible-typed-array-names-1.1.0.tgz) |
| powershell-utils | node_modules/powershell-utils | 0.2.1 | MIT | No | [npm registry](https://registry.npmjs.org/powershell-utils/-/powershell-utils-0.2.1.tgz) |
| prelude-ls | node_modules/prelude-ls | 1.2.1 | MIT | No | [npm registry](https://registry.npmjs.org/prelude-ls/-/prelude-ls-1.2.1.tgz) |
| propagate | node_modules/propagate | 2.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/propagate/-/propagate-2.0.1.tgz) |
| punycode | node_modules/punycode | 2.3.1 | MIT | No | [npm registry](https://registry.npmjs.org/punycode/-/punycode-2.3.1.tgz) |
| rambda | node_modules/rambda | 7.5.0 | MIT | No | [npm registry](https://registry.npmjs.org/rambda/-/rambda-7.5.0.tgz) |
| read-pkg | node_modules/read-pkg | 5.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/read-pkg/-/read-pkg-5.2.0.tgz) |
| read-pkg-up | node_modules/read-pkg-up | 7.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/read-pkg-up/-/read-pkg-up-7.0.1.tgz) |
| find-up | node_modules/read-pkg-up/node_modules/find-up | 4.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/find-up/-/find-up-4.1.0.tgz) |
| locate-path | node_modules/read-pkg-up/node_modules/locate-path | 5.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/locate-path/-/locate-path-5.0.0.tgz) |
| p-limit | node_modules/read-pkg-up/node_modules/p-limit | 2.3.0 | MIT | No | [npm registry](https://registry.npmjs.org/p-limit/-/p-limit-2.3.0.tgz) |
| p-locate | node_modules/read-pkg-up/node_modules/p-locate | 4.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/p-locate/-/p-locate-4.1.0.tgz) |
| type-fest | node_modules/read-pkg-up/node_modules/type-fest | 0.8.1 | (MIT OR CC0-1.0) | No | [npm registry](https://registry.npmjs.org/type-fest/-/type-fest-0.8.1.tgz) |
| type-fest | node_modules/read-pkg/node_modules/type-fest | 0.6.0 | (MIT OR CC0-1.0) | No | [npm registry](https://registry.npmjs.org/type-fest/-/type-fest-0.6.0.tgz) |
| readdirp | node_modules/readdirp | 3.6.0 | MIT | No | [npm registry](https://registry.npmjs.org/readdirp/-/readdirp-3.6.0.tgz) |
| picomatch | node_modules/readdirp/node_modules/picomatch | 2.3.2 | MIT | No | [npm registry](https://registry.npmjs.org/picomatch/-/picomatch-2.3.2.tgz) |
| reflect.getprototypeof | node_modules/reflect.getprototypeof | 1.0.10 | MIT | No | [npm registry](https://registry.npmjs.org/reflect.getprototypeof/-/reflect.getprototypeof-1.0.10.tgz) |
| regexp-tree | node_modules/regexp-tree | 0.1.27 | MIT | No | [npm registry](https://registry.npmjs.org/regexp-tree/-/regexp-tree-0.1.27.tgz) |
| regexp.prototype.flags | node_modules/regexp.prototype.flags | 1.5.4 | MIT | No | [npm registry](https://registry.npmjs.org/regexp.prototype.flags/-/regexp.prototype.flags-1.5.4.tgz) |
| regjsparser | node_modules/regjsparser | 0.10.0 | BSD-2-Clause | No | [npm registry](https://registry.npmjs.org/regjsparser/-/regjsparser-0.10.0.tgz) |
| jsesc | node_modules/regjsparser/node_modules/jsesc | 0.5.0 | MISSING LICENSE FIELD | No | [npm registry](https://registry.npmjs.org/jsesc/-/jsesc-0.5.0.tgz) |
| require-directory | node_modules/require-directory | 2.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/require-directory/-/require-directory-2.1.1.tgz) |
| require-in-the-middle | node_modules/require-in-the-middle | 8.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/require-in-the-middle/-/require-in-the-middle-8.0.1.tgz) |
| resolve | node_modules/resolve | 2.0.0-next.7 | MIT | No | [npm registry](https://registry.npmjs.org/resolve/-/resolve-2.0.0-next.7.tgz) |
| resolve-from | node_modules/resolve-from | 4.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/resolve-from/-/resolve-from-4.0.0.tgz) |
| resolve-pkg-maps | node_modules/resolve-pkg-maps | 1.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/resolve-pkg-maps/-/resolve-pkg-maps-1.0.0.tgz) |
| rimraf | node_modules/rimraf | 6.1.3 | BlueOak-1.0.0 | No | [npm registry](https://registry.npmjs.org/rimraf/-/rimraf-6.1.3.tgz) |
| glob | node_modules/rimraf/node_modules/glob | 13.0.6 | BlueOak-1.0.0 | No | [npm registry](https://registry.npmjs.org/glob/-/glob-13.0.6.tgz) |
| run-applescript | node_modules/run-applescript | 7.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/run-applescript/-/run-applescript-7.1.0.tgz) |
| run-async | node_modules/run-async | 4.0.6 | MIT | No | [npm registry](https://registry.npmjs.org/run-async/-/run-async-4.0.6.tgz) |
| rxjs | node_modules/rxjs | 7.8.2 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/rxjs/-/rxjs-7.8.2.tgz) |
| safe-array-concat | node_modules/safe-array-concat | 1.1.4 | MIT | No | [npm registry](https://registry.npmjs.org/safe-array-concat/-/safe-array-concat-1.1.4.tgz) |
| safe-buffer | node_modules/safe-buffer | 5.2.1 | MIT | No | [npm registry](https://registry.npmjs.org/safe-buffer/-/safe-buffer-5.2.1.tgz) |
| safe-push-apply | node_modules/safe-push-apply | 1.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/safe-push-apply/-/safe-push-apply-1.0.0.tgz) |
| safe-regex-test | node_modules/safe-regex-test | 1.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/safe-regex-test/-/safe-regex-test-1.1.0.tgz) |
| safer-buffer | node_modules/safer-buffer | 2.1.2 | MIT | No | [npm registry](https://registry.npmjs.org/safer-buffer/-/safer-buffer-2.1.2.tgz) |
| semver | node_modules/semver | 7.8.5 | ISC | No | [npm registry](https://registry.npmjs.org/semver/-/semver-7.8.5.tgz) |
| serialize-javascript | node_modules/serialize-javascript | 7.1.2 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/serialize-javascript/-/serialize-javascript-7.1.2.tgz) |
| set-function-length | node_modules/set-function-length | 1.2.2 | MIT | No | [npm registry](https://registry.npmjs.org/set-function-length/-/set-function-length-1.2.2.tgz) |
| set-function-name | node_modules/set-function-name | 2.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/set-function-name/-/set-function-name-2.0.2.tgz) |
| set-proto | node_modules/set-proto | 1.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/set-proto/-/set-proto-1.0.0.tgz) |
| side-channel | node_modules/side-channel | 1.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/side-channel/-/side-channel-1.1.1.tgz) |
| side-channel-list | node_modules/side-channel-list | 1.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/side-channel-list/-/side-channel-list-1.0.1.tgz) |
| side-channel-map | node_modules/side-channel-map | 1.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/side-channel-map/-/side-channel-map-1.0.1.tgz) |
| side-channel-weakmap | node_modules/side-channel-weakmap | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/side-channel-weakmap/-/side-channel-weakmap-1.0.2.tgz) |
| sinon | node_modules/sinon | 18.0.1 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/sinon/-/sinon-18.0.1.tgz) |
| sinon-chai | node_modules/sinon-chai | 3.7.0 | (BSD-2-Clause OR WTFPL) | No | [npm registry](https://registry.npmjs.org/sinon-chai/-/sinon-chai-3.7.0.tgz) |
| supports-color | node_modules/sinon/node_modules/supports-color | 7.2.0 | MIT | No | [npm registry](https://registry.npmjs.org/supports-color/-/supports-color-7.2.0.tgz) |
| source-map-js | node_modules/source-map-js | 1.2.1 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.1.tgz) |
| spdx-correct | node_modules/spdx-correct | 3.2.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/spdx-correct/-/spdx-correct-3.2.0.tgz) |
| spdx-expression-parse | node_modules/spdx-correct/node_modules/spdx-expression-parse | 3.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/spdx-expression-parse/-/spdx-expression-parse-3.0.1.tgz) |
| spdx-exceptions | node_modules/spdx-exceptions | 2.5.0 | CC-BY-3.0 | No | [npm registry](https://registry.npmjs.org/spdx-exceptions/-/spdx-exceptions-2.5.0.tgz) |
| spdx-expression-parse | node_modules/spdx-expression-parse | 4.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/spdx-expression-parse/-/spdx-expression-parse-4.0.0.tgz) |
| spdx-license-ids | node_modules/spdx-license-ids | 3.0.23 | CC0-1.0 | No | [npm registry](https://registry.npmjs.org/spdx-license-ids/-/spdx-license-ids-3.0.23.tgz) |
| stable-hash | node_modules/stable-hash | 0.0.5 | MIT | No | [npm registry](https://registry.npmjs.org/stable-hash/-/stable-hash-0.0.5.tgz) |
| stop-iteration-iterator | node_modules/stop-iteration-iterator | 1.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/stop-iteration-iterator/-/stop-iteration-iterator-1.1.0.tgz) |
| strict-event-emitter | node_modules/strict-event-emitter | 0.5.1 | MIT | No | [npm registry](https://registry.npmjs.org/strict-event-emitter/-/strict-event-emitter-0.5.1.tgz) |
| string-width | node_modules/string-width | 4.2.3 | MIT | No | [npm registry](https://registry.npmjs.org/string-width/-/string-width-4.2.3.tgz) |
| string.prototype.trim | node_modules/string.prototype.trim | 1.2.11 | MIT | No | [npm registry](https://registry.npmjs.org/string.prototype.trim/-/string.prototype.trim-1.2.11.tgz) |
| string.prototype.trimend | node_modules/string.prototype.trimend | 1.0.10 | MIT | No | [npm registry](https://registry.npmjs.org/string.prototype.trimend/-/string.prototype.trimend-1.0.10.tgz) |
| string.prototype.trimstart | node_modules/string.prototype.trimstart | 1.0.8 | MIT | No | [npm registry](https://registry.npmjs.org/string.prototype.trimstart/-/string.prototype.trimstart-1.0.8.tgz) |
| strip-ansi | node_modules/strip-ansi | 6.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/strip-ansi/-/strip-ansi-6.0.1.tgz) |
| strip-bom | node_modules/strip-bom | 3.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/strip-bom/-/strip-bom-3.0.0.tgz) |
| strip-indent | node_modules/strip-indent | 3.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/strip-indent/-/strip-indent-3.0.0.tgz) |
| strip-json-comments | node_modules/strip-json-comments | 3.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/strip-json-comments/-/strip-json-comments-3.1.1.tgz) |
| supports-color | node_modules/supports-color | 8.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/supports-color/-/supports-color-8.1.1.tgz) |
| supports-preserve-symlinks-flag | node_modules/supports-preserve-symlinks-flag | 1.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/supports-preserve-symlinks-flag/-/supports-preserve-symlinks-flag-1.0.0.tgz) |
| tapable | node_modules/tapable | 2.3.3 | MIT | No | [npm registry](https://registry.npmjs.org/tapable/-/tapable-2.3.3.tgz) |
| test-exclude | node_modules/test-exclude | 6.0.0 | ISC | No | [npm registry](https://registry.npmjs.org/test-exclude/-/test-exclude-6.0.0.tgz) |
| balanced-match | node_modules/test-exclude/node_modules/balanced-match | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz) |
| brace-expansion | node_modules/test-exclude/node_modules/brace-expansion | 1.1.21 | MIT | No | [npm registry](https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.21.tgz) |
| glob | node_modules/test-exclude/node_modules/glob | 7.2.3 | ISC | No | [npm registry](https://registry.npmjs.org/glob/-/glob-7.2.3.tgz) |
| minimatch | node_modules/test-exclude/node_modules/minimatch | 3.1.5 | ISC | No | [npm registry](https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz) |
| tinyglobby | node_modules/tinyglobby | 0.2.17 | MIT | No | [npm registry](https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.17.tgz) |
| to-regex-range | node_modules/to-regex-range | 5.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/to-regex-range/-/to-regex-range-5.0.1.tgz) |
| ts-api-utils | node_modules/ts-api-utils | 2.5.0 | MIT | No | [npm registry](https://registry.npmjs.org/ts-api-utils/-/ts-api-utils-2.5.0.tgz) |
| ts-declaration-location | node_modules/ts-declaration-location | 1.0.7 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/ts-declaration-location/-/ts-declaration-location-1.0.7.tgz) |
| ts-node | node_modules/ts-node | 10.9.2 | MIT | No | [npm registry](https://registry.npmjs.org/ts-node/-/ts-node-10.9.2.tgz) |
| diff | node_modules/ts-node/node_modules/diff | 4.0.4 | BSD-3-Clause | No | [npm registry](https://registry.npmjs.org/diff/-/diff-4.0.4.tgz) |
| tsconfig-paths | node_modules/tsconfig-paths | 3.15.0 | MIT | No | [npm registry](https://registry.npmjs.org/tsconfig-paths/-/tsconfig-paths-3.15.0.tgz) |
| tsheredoc | node_modules/tsheredoc | 1.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/tsheredoc/-/tsheredoc-1.0.1.tgz) |
| tunnel-agent | node_modules/tunnel-agent | 0.6.0 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/tunnel-agent/-/tunnel-agent-0.6.0.tgz) |
| type-check | node_modules/type-check | 0.4.0 | MIT | No | [npm registry](https://registry.npmjs.org/type-check/-/type-check-0.4.0.tgz) |
| type-detect | node_modules/type-detect | 4.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/type-detect/-/type-detect-4.1.0.tgz) |
| type-fest | node_modules/type-fest | 0.21.3 | (MIT OR CC0-1.0) | No | [npm registry](https://registry.npmjs.org/type-fest/-/type-fest-0.21.3.tgz) |
| typed-array-buffer | node_modules/typed-array-buffer | 1.0.3 | MIT | No | [npm registry](https://registry.npmjs.org/typed-array-buffer/-/typed-array-buffer-1.0.3.tgz) |
| typed-array-byte-length | node_modules/typed-array-byte-length | 1.0.3 | MIT | No | [npm registry](https://registry.npmjs.org/typed-array-byte-length/-/typed-array-byte-length-1.0.3.tgz) |
| typed-array-byte-offset | node_modules/typed-array-byte-offset | 1.0.4 | MIT | No | [npm registry](https://registry.npmjs.org/typed-array-byte-offset/-/typed-array-byte-offset-1.0.4.tgz) |
| typed-array-length | node_modules/typed-array-length | 1.0.8 | MIT | No | [npm registry](https://registry.npmjs.org/typed-array-length/-/typed-array-length-1.0.8.tgz) |
| typescript | node_modules/typescript | 5.9.3 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz) |
| typescript-eslint | node_modules/typescript-eslint | 8.70.0 | MIT | No | [npm registry](https://registry.npmjs.org/typescript-eslint/-/typescript-eslint-8.70.0.tgz) |
| unbox-primitive | node_modules/unbox-primitive | 1.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/unbox-primitive/-/unbox-primitive-1.1.0.tgz) |
| undici-types | node_modules/undici-types | 8.9.0 | MIT | No | [npm registry](https://registry.npmjs.org/undici-types/-/undici-types-8.9.0.tgz) |
| universalify | node_modules/universalify | 2.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/universalify/-/universalify-2.0.1.tgz) |
| unrs-resolver | node_modules/unrs-resolver | 1.12.2 | MIT | No | [npm registry](https://registry.npmjs.org/unrs-resolver/-/unrs-resolver-1.12.2.tgz) |
| update-browserslist-db | node_modules/update-browserslist-db | 1.3.3 | MIT | No | [npm registry](https://registry.npmjs.org/update-browserslist-db/-/update-browserslist-db-1.3.3.tgz) |
| uri-js | node_modules/uri-js | 4.4.1 | BSD-2-Clause | No | [npm registry](https://registry.npmjs.org/uri-js/-/uri-js-4.4.1.tgz) |
| v8-compile-cache-lib | node_modules/v8-compile-cache-lib | 3.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/v8-compile-cache-lib/-/v8-compile-cache-lib-3.0.1.tgz) |
| v8-to-istanbul | node_modules/v8-to-istanbul | 9.3.0 | ISC | No | [npm registry](https://registry.npmjs.org/v8-to-istanbul/-/v8-to-istanbul-9.3.0.tgz) |
| @jridgewell/trace-mapping | node_modules/v8-to-istanbul/node_modules/@jridgewell/trace-mapping | 0.3.31 | MIT | No | [npm registry](https://registry.npmjs.org/@jridgewell/trace-mapping/-/trace-mapping-0.3.31.tgz) |
| validate-npm-package-license | node_modules/validate-npm-package-license | 3.0.4 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/validate-npm-package-license/-/validate-npm-package-license-3.0.4.tgz) |
| spdx-expression-parse | node_modules/validate-npm-package-license/node_modules/spdx-expression-parse | 3.0.1 | MIT | No | [npm registry](https://registry.npmjs.org/spdx-expression-parse/-/spdx-expression-parse-3.0.1.tgz) |
| which-boxed-primitive | node_modules/which-boxed-primitive | 1.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/which-boxed-primitive/-/which-boxed-primitive-1.1.1.tgz) |
| which-builtin-type | node_modules/which-builtin-type | 1.2.1 | MIT | No | [npm registry](https://registry.npmjs.org/which-builtin-type/-/which-builtin-type-1.2.1.tgz) |
| which-collection | node_modules/which-collection | 1.0.2 | MIT | No | [npm registry](https://registry.npmjs.org/which-collection/-/which-collection-1.0.2.tgz) |
| which-typed-array | node_modules/which-typed-array | 1.1.22 | MIT | No | [npm registry](https://registry.npmjs.org/which-typed-array/-/which-typed-array-1.1.22.tgz) |
| widest-line | node_modules/widest-line | 3.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/widest-line/-/widest-line-3.1.0.tgz) |
| word-wrap | node_modules/word-wrap | 1.2.5 | MIT | No | [npm registry](https://registry.npmjs.org/word-wrap/-/word-wrap-1.2.5.tgz) |
| wordwrap | node_modules/wordwrap | 1.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/wordwrap/-/wordwrap-1.0.0.tgz) |
| workerpool | node_modules/workerpool | 6.5.1 | Apache-2.0 | No | [npm registry](https://registry.npmjs.org/workerpool/-/workerpool-6.5.1.tgz) |
| wrap-ansi | node_modules/wrap-ansi | 7.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-7.0.0.tgz) |
| wrappy | node_modules/wrappy | 1.0.2 | ISC | No | [npm registry](https://registry.npmjs.org/wrappy/-/wrappy-1.0.2.tgz) |
| wsl-utils | node_modules/wsl-utils | 0.4.0 | MIT | No | [npm registry](https://registry.npmjs.org/wsl-utils/-/wsl-utils-0.4.0.tgz) |
| powershell-utils | node_modules/wsl-utils/node_modules/powershell-utils | 0.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/powershell-utils/-/powershell-utils-0.1.0.tgz) |
| y18n | node_modules/y18n | 5.0.8 | ISC | No | [npm registry](https://registry.npmjs.org/y18n/-/y18n-5.0.8.tgz) |
| yargs | node_modules/yargs | 16.2.2 | MIT | No | [npm registry](https://registry.npmjs.org/yargs/-/yargs-16.2.2.tgz) |
| yargs-parser | node_modules/yargs-parser | 20.2.9 | ISC | No | [npm registry](https://registry.npmjs.org/yargs-parser/-/yargs-parser-20.2.9.tgz) |
| yargs-unparser | node_modules/yargs-unparser | 2.0.0 | MIT | No | [npm registry](https://registry.npmjs.org/yargs-unparser/-/yargs-unparser-2.0.0.tgz) |
| is-plain-obj | node_modules/yargs-unparser/node_modules/is-plain-obj | 2.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/is-plain-obj/-/is-plain-obj-2.1.0.tgz) |
| yn | node_modules/yn | 3.1.1 | MIT | No | [npm registry](https://registry.npmjs.org/yn/-/yn-3.1.1.tgz) |
| yocto-queue | node_modules/yocto-queue | 0.1.0 | MIT | No | [npm registry](https://registry.npmjs.org/yocto-queue/-/yocto-queue-0.1.0.tgz) |
| yoctocolors-cjs | node_modules/yoctocolors-cjs | 2.1.3 | MIT | No | [npm registry](https://registry.npmjs.org/yoctocolors-cjs/-/yoctocolors-cjs-2.1.3.tgz) |

## Review Items

- Resolve missing license metadata for regjsparser/node_modules/jsesc@0.5.0 using authoritative package license text/source headers or upstream metadata; do not infer a license.
- Confirm how the OR expressions should be handled for this use case; do not assume that a selected license has already been accepted.
- Confirm runtime dependencies are not bundled into any release artifact and determine whether artifact delivery or dependency installation leaves third-party code on systems outside Salesforce.
- Confirm whether OSS Legal needs only production/runtime dependencies for this producing-package review, or the full build/test graph included here.
- Re-run this report after lockfile changes. The lockfile does not audit source-file notices, copyright, packaged license texts, or security findings.

## Draft Email to OSS Legal

**To:** Denise Lo / OSS Legal  
**Subject:** Dependency license review: @heroku/heroku-credential-manager 0.1.0

Hello Denise,

Please review the dependency-license inventory for @heroku/heroku-credential-manager, a Node.js library used by Heroku CLI consumers to manage credentials and provide injected login flows. It is distributed as an npm package; the manifest currently specifies restricted publish access.

The committed lockfile has 621 external package records (28 runtime and 593 development/build/test). License values recorded are: (BSD-2-Clause OR WTFPL), (MIT OR CC0-1.0), 0BSD, Apache-2.0, BSD-2-Clause, BSD-3-Clause, BlueOak-1.0.0, CC-BY-3.0, CC-BY-4.0, CC0-1.0, ISC, MISSING LICENSE FIELD, MIT, Python-2.0. One development transitive record lacks a license field, and two OR expressions are flagged for review. The full package/version/license/source inventory is in DEPENDENCY-LICENSE-REPORT.md; attach it or replace that reference with an approved shared-drive link before sending.

Based on the manifest and TypeScript build configuration, dependencies appear to remain separately installed npm packages rather than being bundled into compiled dist code. Please confirm whether this is sufficient for the review and whether any specific release artifacts or delivery mechanisms need separate redistribution analysis. We will verify the actual release tarball before treating that assessment as final.

Regards,

[Your name]
