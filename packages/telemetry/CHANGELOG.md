# Changelog

## [0.8.2](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.8.1...telemetry-v0.8.2) (2026-09-21)


### Bug Fixes

* preserve interrupt control flow and Studio compatibility ([#226](https://github.com/kortyx-io/kortyx/issues/226)) ([72ba7c2](https://github.com/kortyx-io/kortyx/commit/72ba7c2b9a467db0e54b5a4ab5844c8d7f895135))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.28.1
    * @kortyx/telemetry-contracts bumped to 0.11.1
    * @kortyx/core bumped to 0.10.1

## [0.8.1](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.8.0...telemetry-v0.8.1) (2026-09-21)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.28.0
    * @kortyx/telemetry-contracts bumped to 0.11.0
    * @kortyx/core bumped to 0.10.0

## [0.8.0](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.7.0...telemetry-v0.8.0) (2026-09-21)


### Features

* **observability:** report handled workflow errors ([#222](https://github.com/kortyx-io/kortyx/issues/222)) ([68a3b0e](https://github.com/kortyx-io/kortyx/commit/68a3b0eea5d93cb89bdcef63c4767f3b0d59e60d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.27.0
    * @kortyx/telemetry-contracts bumped to 0.10.0

## [0.7.0](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.6.3...telemetry-v0.7.0) (2026-09-18)


### Features

* **tools:** add useTool and first-class Studio observability ([#215](https://github.com/kortyx-io/kortyx/issues/215)) ([224c92d](https://github.com/kortyx-io/kortyx/commit/224c92d73caead320dd14582d8b624efc3252c9f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.26.0
    * @kortyx/telemetry-contracts bumped to 0.9.0

## [0.6.3](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.6.2...telemetry-v0.6.3) (2026-09-16)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.25.3
    * @kortyx/telemetry-contracts bumped to 0.8.0

## [0.6.2](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.6.1...telemetry-v0.6.2) (2026-09-15)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.25.2
    * @kortyx/telemetry-contracts bumped to 0.7.0

## [0.6.1](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.6.0...telemetry-v0.6.1) (2026-09-14)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.25.1
    * @kortyx/telemetry-contracts bumped to 0.6.0

## [0.6.0](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.5.2...telemetry-v0.6.0) (2026-09-14)


### ⚠ BREAKING CHANGES

* **errors:** public failure messages and default HTTP statuses change; malformed streams fail explicitly, provider error classes are shared, and retry helpers exclude control flow. Existing calls and legacy records remain supported. See the error-contract migration and release notes.

### Features

* **errors:** harden failure contracts across execution and recovery ([#175](https://github.com/kortyx-io/kortyx/issues/175)) ([d231e36](https://github.com/kortyx-io/kortyx/commit/d231e364259a4f23fc3675d8783fde5ba338416e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.25.0
    * @kortyx/core bumped to 0.9.0

## [0.5.2](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.5.1...telemetry-v0.5.2) (2026-09-11)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.24.0

## [0.5.1](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.5.0...telemetry-v0.5.1) (2026-09-11)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.23.1

## [0.5.0](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.4.2...telemetry-v0.5.0) (2026-09-11)


### ⚠ BREAKING CHANGES

* **openai:** OpenAI now defaults to Responses. Select api: chat-completions on the provider or model to keep the previous transport. Raw payloads remain transport-specific.

### Features

* **openai:** support Responses reasoning tool workflows ([#167](https://github.com/kortyx-io/kortyx/issues/167)) ([b55ba6e](https://github.com/kortyx-io/kortyx/commit/b55ba6e9a16a6f0f39511c4e60961c41f689abd0))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.23.0

## [0.4.2](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.4.1...telemetry-v0.4.2) (2026-09-11)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.22.0
    * @kortyx/telemetry-contracts bumped to 0.5.0

## [0.4.1](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.4.0...telemetry-v0.4.1) (2026-09-10)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.21.0
    * @kortyx/telemetry-contracts bumped to 0.4.0

## [0.4.0](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.3.0...telemetry-v0.4.0) (2026-09-10)


### Features

* cancel workflow trees and reflect cancellation in Studio ([#161](https://github.com/kortyx-io/kortyx/issues/161)) ([699ad18](https://github.com/kortyx-io/kortyx/commit/699ad18905955c6340c3d85b9fae7f0bffd00a0d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.20.0

## [0.3.0](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.2.0...telemetry-v0.3.0) (2026-09-09)


### Features

* add resumable child workflows and Studio inspection ([#157](https://github.com/kortyx-io/kortyx/issues/157)) ([542ba29](https://github.com/kortyx-io/kortyx/commit/542ba29b3b57217e6e5d98c1b409bbec5ce3261f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.19.0
    * @kortyx/telemetry-contracts bumped to 0.3.0

## [0.2.0](https://github.com/kortyx-io/kortyx/compare/telemetry-v0.1.0...telemetry-v0.2.0) (2026-08-02)


### Features

* **studio:** harden self-hosted preview ([c5438f8](https://github.com/kortyx-io/kortyx/commit/c5438f89499f98df7bf6d10cff9e1e37812a1496))
* **studio:** release self-hosted observability preview ([4e9d3fd](https://github.com/kortyx-io/kortyx/commit/4e9d3fdbc7233f9b1de94ca1afe6dbae9cc9157f))
* **studio:** release self-hosted observability preview ([#139](https://github.com/kortyx-io/kortyx/issues/139)) ([4e9d3fd](https://github.com/kortyx-io/kortyx/commit/4e9d3fdbc7233f9b1de94ca1afe6dbae9cc9157f))
* **telemetry:** add persisted studio read models ([cebb06b](https://github.com/kortyx-io/kortyx/commit/cebb06bb74ccd4422e263f0ff4efa0fee5a16240))


### Bug Fixes

* harden interrupt lifecycle semantics ([958d149](https://github.com/kortyx-io/kortyx/commit/958d149596d54215821ef5a7f8562a06a7459149))
* **studio:** reconcile incomplete run lifecycles ([2a3d9f4](https://github.com/kortyx-io/kortyx/commit/2a3d9f4cc927cccfd6efc6256a848b704a0d203f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/hooks bumped to 0.18.0
    * @kortyx/telemetry-contracts bumped to 0.2.0

## 0.1.0

- Initial Studio telemetry HTTP adapter.
