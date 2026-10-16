# Changelog

## [0.4.0](https://github.com/kortyx-io/kortyx/compare/usage-telemetry-v0.3.0...usage-telemetry-v0.4.0) (2026-10-16)


### Features

* **studio:** standardize tables, filters and column behavior ([#353](https://github.com/kortyx-io/kortyx/issues/353)) ([c662e59](https://github.com/kortyx-io/kortyx/commit/c662e59d814a6a9f12c709595968ee7b1ece3191))
* **telemetry:** improve failure classification and add CLI usage ([#355](https://github.com/kortyx-io/kortyx/issues/355)) ([c5fbbed](https://github.com/kortyx-io/kortyx/commit/c5fbbed3064ea7b2b3020617db7ce09d1b175db3))

## [0.3.0](https://github.com/kortyx-io/kortyx/compare/usage-telemetry-v0.2.0...usage-telemetry-v0.3.0) (2026-10-13)


### ⚠ BREAKING CHANGES

* **runtime:** Consumer eval routes cap active attempts at 20 by default. Set maxActiveAttempts before upgrading consumers with higher concurrency. Upgrade API and Studio together for the new case-dispatch progress events.

### Features

* **runtime:** add opt-in workflow data reducers ([#340](https://github.com/kortyx-io/kortyx/issues/340)) ([8be2c81](https://github.com/kortyx-io/kortyx/commit/8be2c81f74c5c51ab98443144f3491d4e8d54a88))

## [0.2.0](https://github.com/kortyx-io/kortyx/compare/usage-telemetry-v0.1.0...usage-telemetry-v0.2.0) (2026-10-11)


### Features

* add shared SDK and Studio usage telemetry ([#313](https://github.com/kortyx-io/kortyx/issues/313)) ([7d5f0c0](https://github.com/kortyx-io/kortyx/commit/7d5f0c005bd7721dc6a529554e75c14573d76a0f))
