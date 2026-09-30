# Changelog

## 0.1.0 (2026-09-30)


### ⚠ BREAKING CHANGES

* refresh the credential storage implementation ([#49](https://github.com/heroku/heroku-credential-manager/issues/49))

### Features

* add credential storage selector ([#13](https://github.com/heroku/heroku-credential-manager/issues/13)) ([050bde7](https://github.com/heroku/heroku-credential-manager/commit/050bde7a51352a97b6737bc66e586946fee5cc68))
* add injectable login entry point ([#50](https://github.com/heroku/heroku-credential-manager/issues/50)) ([31c8429](https://github.com/heroku/heroku-credential-manager/commit/31c8429d3a7f7aca3f0e0913d1f0855fba9c60ae))
* add linux handler ([#11](https://github.com/heroku/heroku-credential-manager/issues/11)) ([a0dfa21](https://github.com/heroku/heroku-credential-manager/commit/a0dfa21611c8abea434bb830ea74dbf6a906156d))
* add macOS handler ([#10](https://github.com/heroku/heroku-credential-manager/issues/10)) ([675c398](https://github.com/heroku/heroku-credential-manager/commit/675c3981099b8326db316d53d4974a7fd5389a2f))
* add main entry points ([#14](https://github.com/heroku/heroku-credential-manager/issues/14)) ([8b440b6](https://github.com/heroku/heroku-credential-manager/commit/8b440b6db9120795c63aa29da2df7a71d7adcc23))
* add netrc-handler and tests ([#8](https://github.com/heroku/heroku-credential-manager/issues/8)) ([178e842](https://github.com/heroku/heroku-credential-manager/commit/178e842e7862d98ee05ab58eb1e7fcf692db0173))
* add windows handler ([#9](https://github.com/heroku/heroku-credential-manager/issues/9)) ([078b4b2](https://github.com/heroku/heroku-credential-manager/commit/078b4b216581f91f293690cb9bf443b0ff57ccce))
* align login transport with token-bound API clients ([#62](https://github.com/heroku/heroku-credential-manager/issues/62)) ([f7ccb07](https://github.com/heroku/heroku-credential-manager/commit/f7ccb07df0fec4f54dc8d34a46ecc6bef9472c93))
* optional account with multi-account selection for getAuth/removeAuth ([#20](https://github.com/heroku/heroku-credential-manager/issues/20)) ([86c85ac](https://github.com/heroku/heroku-credential-manager/commit/86c85acc4c96a99243390bb19b73ab28bd96640d))
* refresh the credential storage implementation ([#49](https://github.com/heroku/heroku-credential-manager/issues/49)) ([48aaafd](https://github.com/heroku/heroku-credential-manager/commit/48aaafdae56c9648fa1e2e9f08b88dedc153a52c))
* **W-20824292:** add README, LICENSE, CODE_OF_CONDUCT, CONTRIBUTING, and SECURITY files ([#18](https://github.com/heroku/heroku-credential-manager/issues/18)) ([715fbdc](https://github.com/heroku/heroku-credential-manager/commit/715fbdc27a74e5b7f961c904811eeffa2b87787b))
* **W-20904459:** Add netrc-parser functionality ([#4](https://github.com/heroku/heroku-credential-manager/issues/4)) ([dac1513](https://github.com/heroku/heroku-credential-manager/commit/dac15137b10a19a2b72cb844a49b7011c338d137))


### Dependencies

* bump actions/checkout from 6 to 7 ([#37](https://github.com/heroku/heroku-credential-manager/issues/37)) ([7773f0c](https://github.com/heroku/heroku-credential-manager/commit/7773f0c3f4914f16ede5b757ef4c7057b10d9ec3))
* bump actions/setup-node from 6 to 7 ([#38](https://github.com/heroku/heroku-credential-manager/issues/38)) ([d07ae60](https://github.com/heroku/heroku-credential-manager/commit/d07ae60afa20bc5452673369ce1f4836c01bd722))
* bump brace-expansion ([#39](https://github.com/heroku/heroku-credential-manager/issues/39)) ([fa174f2](https://github.com/heroku/heroku-credential-manager/commit/fa174f2d4d8d062db2fb983fea3ac9763a9b6157))
* bump flatted from 3.3.3 to 3.4.2 ([#27](https://github.com/heroku/heroku-credential-manager/issues/27)) ([1d4db71](https://github.com/heroku/heroku-credential-manager/commit/1d4db71105b68884a185734d84edd8daa703c752))
* bump js-yaml from 3.14.2 to 3.15.2 ([#41](https://github.com/heroku/heroku-credential-manager/issues/41)) ([22616db](https://github.com/heroku/heroku-credential-manager/commit/22616dbe2b1afd0c7f263c28215a19c44ab10e89))
* bump lodash from 4.17.21 to 4.18.1 ([#33](https://github.com/heroku/heroku-credential-manager/issues/33)) ([dae75df](https://github.com/heroku/heroku-credential-manager/commit/dae75df1fa2a990fdacc8e7a1db79d2518bfdf5d))
* bump path-to-regexp from 8.3.0 to 8.4.2 ([#32](https://github.com/heroku/heroku-credential-manager/issues/32)) ([564e800](https://github.com/heroku/heroku-credential-manager/commit/564e800406a8cf3b7e67803a5033f297a6ea848f))
* bump picomatch ([#35](https://github.com/heroku/heroku-credential-manager/issues/35)) ([b959b40](https://github.com/heroku/heroku-credential-manager/commit/b959b40c46ae795f77545c49670adf6fab50776c))
* bump serialize-javascript and mocha ([#43](https://github.com/heroku/heroku-credential-manager/issues/43)) ([d749fd7](https://github.com/heroku/heroku-credential-manager/commit/d749fd709c063516485355e3b3b6e338423611cd))
* bump the dev-patch-minor-dependencies group across 1 directory with 2 updates ([#40](https://github.com/heroku/heroku-credential-manager/issues/40)) ([74323e2](https://github.com/heroku/heroku-credential-manager/commit/74323e2843d40622ab7b00983718134232cf54c8))
* bump uuid and @heroku-cli/test-utils ([#44](https://github.com/heroku/heroku-credential-manager/issues/44)) ([5a54225](https://github.com/heroku/heroku-credential-manager/commit/5a54225f00301e6be9a2a515aa727d68c63ea7d6))


### Miscellaneous Chores

* release 0.1.0 ([#65](https://github.com/heroku/heroku-credential-manager/issues/65)) ([f9666cf](https://github.com/heroku/heroku-credential-manager/commit/f9666cf5d10aa1428036281f7fea5c87cba6e87e))
