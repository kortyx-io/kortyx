# Changelog

## [0.5.4](https://github.com/kortyx-io/kortyx/compare/openai-v0.5.3...openai-v0.5.4) (2026-09-22)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.8.3
    * @kortyx/core bumped to 0.11.0

## [0.5.3](https://github.com/kortyx-io/kortyx/compare/openai-v0.5.2...openai-v0.5.3) (2026-09-21)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.8.2
    * @kortyx/core bumped to 0.10.1

## [0.5.2](https://github.com/kortyx-io/kortyx/compare/openai-v0.5.1...openai-v0.5.2) (2026-09-21)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.8.1
    * @kortyx/core bumped to 0.10.0

## [0.5.1](https://github.com/kortyx-io/kortyx/compare/openai-v0.5.0...openai-v0.5.1) (2026-09-18)


### Bug Fixes

* **telemetry:** refresh model pricing and reject incomplete totals ([#213](https://github.com/kortyx-io/kortyx/issues/213)) ([b9e44f9](https://github.com/kortyx-io/kortyx/commit/b9e44f94c506f1d74b4f52a56b7b1998a1a932b5))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.8.0

## [0.5.0](https://github.com/kortyx-io/kortyx/compare/openai-v0.4.1...openai-v0.5.0) (2026-09-14)


### ⚠ BREAKING CHANGES

* **errors:** public failure messages and default HTTP statuses change; malformed streams fail explicitly, provider error classes are shared, and retry helpers exclude control flow. Existing calls and legacy records remain supported. See the error-contract migration and release notes.

### Features

* **errors:** harden failure contracts across execution and recovery ([#175](https://github.com/kortyx-io/kortyx/issues/175)) ([d231e36](https://github.com/kortyx-io/kortyx/commit/d231e364259a4f23fc3675d8783fde5ba338416e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.7.0
    * @kortyx/core bumped to 0.9.0

## [0.4.1](https://github.com/kortyx-io/kortyx/compare/openai-v0.4.0...openai-v0.4.1) (2026-09-11)


### Bug Fixes

* **providers:** preserve reasoning across tool workflows ([#169](https://github.com/kortyx-io/kortyx/issues/169)) ([6e4e403](https://github.com/kortyx-io/kortyx/commit/6e4e403d104d83586e05aab799510bc4c35b0f49))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.6.1

## [0.4.0](https://github.com/kortyx-io/kortyx/compare/openai-v0.3.0...openai-v0.4.0) (2026-09-11)


### ⚠ BREAKING CHANGES

* **openai:** OpenAI now defaults to Responses. Select api: chat-completions on the provider or model to keep the previous transport. Raw payloads remain transport-specific.

### Features

* **openai:** support Responses reasoning tool workflows ([#167](https://github.com/kortyx-io/kortyx/issues/167)) ([b55ba6e](https://github.com/kortyx-io/kortyx/commit/b55ba6e9a16a6f0f39511c4e60961c41f689abd0))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.6.0

## [0.3.0](https://github.com/kortyx-io/kortyx/compare/openai-v0.2.0...openai-v0.3.0) (2026-05-25)


### Features

* add MCP tool support to useReason ([8352721](https://github.com/kortyx-io/kortyx/commit/83527215fd2fa6362348d842f8f3b9e9d9d03704))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.5.0

## [0.2.0](https://github.com/kortyx-io/kortyx/compare/openai-v0.1.0...openai-v0.2.0) (2026-04-28)


### Features

* **openai:** add OpenAI provider ([e8bbee0](https://github.com/kortyx-io/kortyx/commit/e8bbee0c463dd6a20227f987882dc3d58a952298))
* **openai:** add OpenAI provider ([6e67e34](https://github.com/kortyx-io/kortyx/commit/6e67e344e41e064c9a02ec485270c3fc7705adc8))

## 0.1.0

- Initial OpenAI provider package for Kortyx.
