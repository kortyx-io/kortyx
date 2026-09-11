# Changelog

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
