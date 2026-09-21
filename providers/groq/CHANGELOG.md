# Changelog

## [0.4.2](https://github.com/kortyx-io/kortyx/compare/groq-v0.4.1...groq-v0.4.2) (2026-09-21)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.8.1
    * @kortyx/core bumped to 0.10.0

## [0.4.1](https://github.com/kortyx-io/kortyx/compare/groq-v0.4.0...groq-v0.4.1) (2026-09-18)


### Bug Fixes

* **telemetry:** refresh model pricing and reject incomplete totals ([#213](https://github.com/kortyx-io/kortyx/issues/213)) ([b9e44f9](https://github.com/kortyx-io/kortyx/commit/b9e44f94c506f1d74b4f52a56b7b1998a1a932b5))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.8.0

## [0.4.0](https://github.com/kortyx-io/kortyx/compare/groq-v0.3.2...groq-v0.4.0) (2026-09-14)


### ⚠ BREAKING CHANGES

* **errors:** public failure messages and default HTTP statuses change; malformed streams fail explicitly, provider error classes are shared, and retry helpers exclude control flow. Existing calls and legacy records remain supported. See the error-contract migration and release notes.

### Features

* **errors:** harden failure contracts across execution and recovery ([#175](https://github.com/kortyx-io/kortyx/issues/175)) ([d231e36](https://github.com/kortyx-io/kortyx/commit/d231e364259a4f23fc3675d8783fde5ba338416e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.7.0
    * @kortyx/core bumped to 0.9.0

## [0.3.2](https://github.com/kortyx-io/kortyx/compare/groq-v0.3.1...groq-v0.3.2) (2026-09-11)


### Bug Fixes

* **providers:** preserve reasoning across tool workflows ([#169](https://github.com/kortyx-io/kortyx/issues/169)) ([6e4e403](https://github.com/kortyx-io/kortyx/commit/6e4e403d104d83586e05aab799510bc4c35b0f49))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.6.1

## [0.3.1](https://github.com/kortyx-io/kortyx/compare/groq-v0.3.0...groq-v0.3.1) (2026-09-11)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.6.0

## [0.3.0](https://github.com/kortyx-io/kortyx/compare/groq-v0.2.0...groq-v0.3.0) (2026-05-25)


### Features

* add MCP tool support to useReason ([8352721](https://github.com/kortyx-io/kortyx/commit/83527215fd2fa6362348d842f8f3b9e9d9d03704))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.5.0

## [0.2.0](https://github.com/kortyx-io/kortyx/compare/groq-v0.1.0...groq-v0.2.0) (2026-04-28)


### Features

* **groq:** add Groq provider ([96622ea](https://github.com/kortyx-io/kortyx/commit/96622ea8df4e7d606fd116fde9ce597c36876474))
* **groq:** add Groq provider ([ae4fe57](https://github.com/kortyx-io/kortyx/commit/ae4fe577634160b19617f3947f5154747eff4016))

## 0.1.0

- Initial Groq provider package for Kortyx.
