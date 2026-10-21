# Changelog

## [0.6.0](https://github.com/kortyx-io/kortyx/compare/usage-telemetry-v0.5.0...usage-telemetry-v0.6.0) (2026-10-21)


### Features

* **evals:** add deterministic checks and failed-case reruns ([8b63a21](https://github.com/kortyx-io/kortyx/commit/8b63a214b59a55c36df3facd6b85f38def62f568))

## [0.5.0](https://github.com/kortyx-io/kortyx/compare/usage-telemetry-v0.4.0...usage-telemetry-v0.5.0) (2026-10-18)


### Features

* **cli:** validate topology and update compatible dependencies ([6c16ef3](https://github.com/kortyx-io/kortyx/commit/6c16ef3d1c9e8329d31f1a28e87aa26ae6dbe651))
* **studio:** add contextual help and organize product documentation ([#366](https://github.com/kortyx-io/kortyx/issues/366)) ([aa4a624](https://github.com/kortyx-io/kortyx/commit/aa4a6242f6294e0f96968a8021440cdc55467121))
* **studio:** add sample project and guided onboarding ([#363](https://github.com/kortyx-io/kortyx/issues/363)) ([25da0b9](https://github.com/kortyx-io/kortyx/commit/25da0b9c92072446a7503b23ba4f157aebec8185))

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
