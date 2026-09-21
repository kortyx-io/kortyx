# Changelog

## [0.11.1](https://github.com/kortyx-io/kortyx/compare/cli-v0.11.0...cli-v0.11.1) (2026-09-21)


### Bug Fixes

* preserve interrupt control flow and Studio compatibility ([#226](https://github.com/kortyx-io/kortyx/issues/226)) ([72ba7c2](https://github.com/kortyx-io/kortyx/commit/72ba7c2b9a467db0e54b5a4ab5844c8d7f895135))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.26.1
    * @kortyx/core bumped to 0.10.1
    * @kortyx/telemetry-contracts bumped to 0.11.1

## [0.11.0](https://github.com/kortyx-io/kortyx/compare/cli-v0.10.1...cli-v0.11.0) (2026-09-21)


### Features

* **hooks:** add model-driven interrupt contracts to useReason ([#224](https://github.com/kortyx-io/kortyx/issues/224)) ([e0147d5](https://github.com/kortyx-io/kortyx/commit/e0147d5234ca38d450d452af924b242f8cbdeb16))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.26.0
    * @kortyx/core bumped to 0.10.0
    * @kortyx/telemetry-contracts bumped to 0.11.0

## [0.10.1](https://github.com/kortyx-io/kortyx/compare/cli-v0.10.0...cli-v0.10.1) (2026-09-21)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.25.1
    * @kortyx/telemetry-contracts bumped to 0.10.0

## [0.10.0](https://github.com/kortyx-io/kortyx/compare/cli-v0.9.0...cli-v0.10.0) (2026-09-19)


### Features

* **cli:** add read-only Studio debugging ([#217](https://github.com/kortyx-io/kortyx/issues/217)) ([6c96433](https://github.com/kortyx-io/kortyx/commit/6c9643355c720815f79509b41860f2c1e4e4d706))

## [0.9.0](https://github.com/kortyx-io/kortyx/compare/cli-v0.8.0...cli-v0.9.0) (2026-09-18)


### Features

* **tools:** add useTool and first-class Studio observability ([#215](https://github.com/kortyx-io/kortyx/issues/215)) ([224c92d](https://github.com/kortyx-io/kortyx/commit/224c92d73caead320dd14582d8b624efc3252c9f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.25.0
    * @kortyx/telemetry-contracts bumped to 0.9.0

## [0.8.0](https://github.com/kortyx-io/kortyx/compare/cli-v0.7.3...cli-v0.8.0) (2026-09-16)


### Features

* **studio:** surface consumer feedback and human reviews ([#209](https://github.com/kortyx-io/kortyx/issues/209)) ([b757879](https://github.com/kortyx-io/kortyx/commit/b757879ab72c3bb3bf3d5c8f2d10611606834cf6))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.24.0
    * @kortyx/telemetry-contracts bumped to 0.8.0

## [0.7.3](https://github.com/kortyx-io/kortyx/compare/cli-v0.7.2...cli-v0.7.3) (2026-09-16)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.23.0

## [0.7.2](https://github.com/kortyx-io/kortyx/compare/cli-v0.7.1...cli-v0.7.2) (2026-09-15)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.22.2
    * @kortyx/telemetry-contracts bumped to 0.7.0

## [0.7.1](https://github.com/kortyx-io/kortyx/compare/cli-v0.7.0...cli-v0.7.1) (2026-09-14)


### Bug Fixes

* **studio:** preserve host ownership of updater state ([#186](https://github.com/kortyx-io/kortyx/issues/186)) ([45c5b0c](https://github.com/kortyx-io/kortyx/commit/45c5b0c9736a1a4af9d4323747af77dbb98c32bf))

## [0.7.0](https://github.com/kortyx-io/kortyx/compare/cli-v0.6.0...cli-v0.7.0) (2026-09-14)


### Features

* **studio:** add manual and scheduled updates through a release CDN ([#181](https://github.com/kortyx-io/kortyx/issues/181)) ([af1fde3](https://github.com/kortyx-io/kortyx/commit/af1fde351642f3bf8e240ff41f5c7f9ad88584de))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.22.1
    * @kortyx/telemetry-contracts bumped to 0.6.0

## [0.6.0](https://github.com/kortyx-io/kortyx/compare/cli-v0.5.6...cli-v0.6.0) (2026-09-14)


### ⚠ BREAKING CHANGES

* **errors:** public failure messages and default HTTP statuses change; malformed streams fail explicitly, provider error classes are shared, and retry helpers exclude control flow. Existing calls and legacy records remain supported. See the error-contract migration and release notes.

### Features

* **errors:** harden failure contracts across execution and recovery ([#175](https://github.com/kortyx-io/kortyx/issues/175)) ([d231e36](https://github.com/kortyx-io/kortyx/commit/d231e364259a4f23fc3675d8783fde5ba338416e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.22.0
    * @kortyx/core bumped to 0.9.0

## [0.5.6](https://github.com/kortyx-io/kortyx/compare/cli-v0.5.5...cli-v0.5.6) (2026-09-11)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.21.0

## [0.5.5](https://github.com/kortyx-io/kortyx/compare/cli-v0.5.4...cli-v0.5.5) (2026-09-11)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.20.1

## [0.5.4](https://github.com/kortyx-io/kortyx/compare/cli-v0.5.3...cli-v0.5.4) (2026-09-11)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.20.0

## [0.5.3](https://github.com/kortyx-io/kortyx/compare/cli-v0.5.2...cli-v0.5.3) (2026-09-11)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.19.0
    * @kortyx/telemetry-contracts bumped to 0.5.0

## [0.5.2](https://github.com/kortyx-io/kortyx/compare/cli-v0.5.1...cli-v0.5.2) (2026-09-10)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.18.0
    * @kortyx/core bumped to 0.8.0
    * @kortyx/telemetry-contracts bumped to 0.4.0

## [0.5.1](https://github.com/kortyx-io/kortyx/compare/cli-v0.5.0...cli-v0.5.1) (2026-09-10)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.17.0
    * @kortyx/core bumped to 0.7.0

## [0.5.0](https://github.com/kortyx-io/kortyx/compare/cli-v0.4.0...cli-v0.5.0) (2026-09-09)


### Features

* add resumable child workflows and Studio inspection ([#157](https://github.com/kortyx-io/kortyx/issues/157)) ([542ba29](https://github.com/kortyx-io/kortyx/commit/542ba29b3b57217e6e5d98c1b409bbec5ce3261f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.16.0
    * @kortyx/core bumped to 0.6.0
    * @kortyx/telemetry-contracts bumped to 0.3.0

## [0.4.0](https://github.com/kortyx-io/kortyx/compare/cli-v0.3.0...cli-v0.4.0) (2026-08-31)


### Features

* **cli:** improve Studio onboarding output ([#150](https://github.com/kortyx-io/kortyx/issues/150)) ([5f02710](https://github.com/kortyx-io/kortyx/commit/5f027106a69d9154d583c86b295db347dea12669))

## [0.3.0](https://github.com/kortyx-io/kortyx/compare/cli-v0.2.0...cli-v0.3.0) (2026-08-02)


### Features

* **studio:** add portable self-hosting contract ([82f4851](https://github.com/kortyx-io/kortyx/commit/82f4851d7a945300fb779d08dc6fb75ed3e35c78))
* **studio:** add portable self-hosting deployment ([6775f11](https://github.com/kortyx-io/kortyx/commit/6775f1127cb35de86e17d01ff78d94edf32f9fd2))

## [0.2.0](https://github.com/kortyx-io/kortyx/compare/cli-v0.1.5...cli-v0.2.0) (2026-08-02)


### Features

* **cli:** add local Studio lifecycle ([6de8d4a](https://github.com/kortyx-io/kortyx/commit/6de8d4a438e12bb12648e26d7bf92cf3bd6ea987))
* **cli:** add Studio OSS lifecycle commands ([aa3e474](https://github.com/kortyx-io/kortyx/commit/aa3e474ae134ed5ccff77021193553828a941f85))
* **release:** add multi-architecture Studio pipeline ([f2d05b0](https://github.com/kortyx-io/kortyx/commit/f2d05b0550b7132bd51e7b3282a34e01f2b64ec7))
* **studio:** harden self-hosted preview ([c5438f8](https://github.com/kortyx-io/kortyx/commit/c5438f89499f98df7bf6d10cff9e1e37812a1496))
* **studio:** release self-hosted observability preview ([4e9d3fd](https://github.com/kortyx-io/kortyx/commit/4e9d3fdbc7233f9b1de94ca1afe6dbae9cc9157f))
* **studio:** release self-hosted observability preview ([#139](https://github.com/kortyx-io/kortyx/issues/139)) ([4e9d3fd](https://github.com/kortyx-io/kortyx/commit/4e9d3fdbc7233f9b1de94ca1afe6dbae9cc9157f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.15.0
    * @kortyx/telemetry-contracts bumped to 0.2.0

## [0.1.5](https://github.com/kortyx-io/kortyx/compare/cli-v0.1.4...cli-v0.1.5) (2026-02-17)


### Bug Fixes

* **release:** publish packages with pnpm and public access ([357e268](https://github.com/kortyx-io/kortyx/commit/357e2680469e729ea58d103915989142f668a39a))
* **release:** publish packages with pnpm and public access ([5ef7498](https://github.com/kortyx-io/kortyx/commit/5ef7498330129f376ca7197b70cb7b6a38138e8a))

## [0.1.4](https://github.com/kortyx-io/kortyx/compare/cli-v0.1.3...cli-v0.1.4) (2026-02-17)


### Bug Fixes

* **meta:** normalize project links in package manifests ([54202eb](https://github.com/kortyx-io/kortyx/commit/54202ebe7fe04505763d7636d20b6c607e7df82d))

## [0.1.3](https://github.com/kortyx-io/kortyx/compare/cli-v0.1.2...cli-v0.1.3) (2026-01-25)


### Bug Fixes

* package scripts and dist ([0ed75d3](https://github.com/kortyx-io/kortyx/commit/0ed75d362230a5eddc83b269d14cb787fbf84fb8))

## [0.1.2](https://github.com/kortyx-io/kortyx/compare/cli-v0.1.1...cli-v0.1.2) (2026-01-22)


### Bug Fixes

* add repo info ([e1faa47](https://github.com/kortyx-io/kortyx/commit/e1faa4704c35e9ca7f9bbfd85ab8672f94d389bd))

## [0.1.1](https://github.com/kortyx-io/kortyx/compare/cli-v0.1.0...cli-v0.1.1) (2026-01-22)


### Bug Fixes

* test release ([42228be](https://github.com/kortyx-io/kortyx/commit/42228be5fad0993d06f8fd941bd4a1640a7712d9))

## [0.1.0](https://github.com/kortyx-io/kortyx/compare/cli-v0.0.1...cli-v0.1.0) (2026-01-21)


### Features

* init kortyx monorepo ([38e59a2](https://github.com/kortyx-io/kortyx/commit/38e59a2afb0134e635145ed50c5804c0676640dc))
