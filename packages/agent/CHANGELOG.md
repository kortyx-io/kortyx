# Changelog

## Unreleased

- Preserve completed tool results and addressed human answers across root and child execution-budget continuations. Continue renews only the saved allowance and does not answer a later review.

- Add bounded, idempotent queued eval execution with shared consumer capacity,
  event replay, explicit cancellation and optional PostgreSQL recovery.


## [0.43.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.43.0...agent-v0.43.1) (2026-10-25)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.26.5
    * @kortyx/telemetry-contracts bumped to 0.20.3
  * devDependencies
    * @kortyx/hooks bumped to 0.35.6

## [0.43.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.42.0...agent-v0.43.0) (2026-10-24)


### Features

* **evals:** configure grading deadlines with inherited defaults ([2c5d8d3](https://github.com/kortyx-io/kortyx/commit/2c5d8d3be9016d19da248712e9d2e887366ca0c6))


### Bug Fixes

* **cli:** compare recorded attempts and type evidence offsets ([a2b9b95](https://github.com/kortyx-io/kortyx/commit/a2b9b95b39b260d79b9ceba5edf362e141129136))
* **evals:** export grading deadlines and cover cancellation guards ([7c04d8f](https://github.com/kortyx-io/kortyx/commit/7c04d8f0147edf96bbd379fb31f72f03fe1b6e11))
* normalize inspection envelopes and harden compatibility diagnostics ([467de41](https://github.com/kortyx-io/kortyx/commit/467de41836e11ae6a13123fe22e51c23e4973496))
* recover invalid reason output and bound evaluation inspection ([56528ab](https://github.com/kortyx-io/kortyx/commit/56528ab6a3c33dd64c594e4a0579cd85d31a0e47))
* **runtime:** repair structured output and bound eval inspection ([f60d70d](https://github.com/kortyx-io/kortyx/commit/f60d70db1d9bbe3c71e0bdc856f0447fb12b8234))
* **studio:** refine eval controls, tables and grading timeouts ([646718b](https://github.com/kortyx-io/kortyx/commit/646718b95f0372a3f96d88a65fe1a4a709a31c34))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.26.4
    * @kortyx/prompts bumped to 0.3.1
    * @kortyx/usage-telemetry bumped to 0.6.1
    * @kortyx/telemetry-contracts bumped to 0.20.2
  * devDependencies
    * @kortyx/hooks bumped to 0.35.5

## [0.42.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.41.1...agent-v0.42.0) (2026-10-22)


### Features

* **evals:** add portable judge prompts and suite-owned judges ([9a11389](https://github.com/kortyx-io/kortyx/commit/9a11389203ac08ba9dbf1700e9838ad1b5b59d1c))
* **evals:** add portable judge prompts and suite-owned judges ([18092cf](https://github.com/kortyx-io/kortyx/commit/18092cf0840933beeda98b6e3d17f774f2f4678d))


### Bug Fixes

* **release:** replace unpublished eval release candidate ([#391](https://github.com/kortyx-io/kortyx/issues/391)) ([7d9898c](https://github.com/kortyx-io/kortyx/commit/7d9898cec73a6eaf1daf3504bc17520437a293d1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.26.3
    * @kortyx/prompts bumped to 0.3.0
    * @kortyx/telemetry-contracts bumped to 0.20.1
  * devDependencies
    * @kortyx/hooks bumped to 0.35.4

## [0.41.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.41.0...agent-v0.41.1) (2026-10-21)


### Bug Fixes

* **studio:** bound comparison memory and load summaries asynchronously ([221087a](https://github.com/kortyx-io/kortyx/commit/221087ac4340ea078b8c9145a6bb1a51f9dab7c0))
* **studio:** bound evaluation comparison memory ([8403bd2](https://github.com/kortyx-io/kortyx/commit/8403bd2e910d115c9d0393f2fb28dcf3e1bb972d))

## [0.41.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.40.2...agent-v0.41.0) (2026-10-21)


### Features

* **evals:** add deterministic checks and failed-case reruns ([8b63a21](https://github.com/kortyx-io/kortyx/commit/8b63a214b59a55c36df3facd6b85f38def62f568))
* **studio:** improve eval navigation, comparisons and inspection ([4d18eed](https://github.com/kortyx-io/kortyx/commit/4d18eed1db566e808e220215008951a46ef6113c))
* **studio:** unify eval browsing and conversation comparisons ([7f6d26e](https://github.com/kortyx-io/kortyx/commit/7f6d26ef60474c113c84d3549fe13acd27731d8d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.26.2
    * @kortyx/prompts bumped to 0.2.4
    * @kortyx/usage-telemetry bumped to 0.6.0
    * @kortyx/telemetry-contracts bumped to 0.20.0
  * devDependencies
    * @kortyx/hooks bumped to 0.35.3

## [0.40.2](https://github.com/kortyx-io/kortyx/compare/agent-v0.40.1...agent-v0.40.2) (2026-10-20)


### Bug Fixes

* **evals:** keep live updates off full-result reads ([301d690](https://github.com/kortyx-io/kortyx/commit/301d69087167ce6086c45ec4c7efe4679bb5604b))
* **evals:** keep live updates off full-result reads ([76f846b](https://github.com/kortyx-io/kortyx/commit/76f846bdc86c1f9b3e4ff1ff593f86c8e3f7ba98))

## [0.40.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.40.0...agent-v0.40.1) (2026-10-18)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.26.1
    * @kortyx/telemetry-contracts bumped to 0.19.1
  * devDependencies
    * @kortyx/hooks bumped to 0.35.2

## [0.40.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.39.0...agent-v0.40.0) (2026-10-18)


### Features

* **studio:** drain evaluation workers and consumer endpoints safely ([#365](https://github.com/kortyx-io/kortyx/issues/365)) ([0bcd853](https://github.com/kortyx-io/kortyx/commit/0bcd85310f5ccf59772b2fa9ed4dd28d03394546))


### Bug Fixes

* retain workflow catalogs and text interrupt questions ([#369](https://github.com/kortyx-io/kortyx/issues/369)) ([7608f65](https://github.com/kortyx-io/kortyx/commit/7608f6503167ed94feda30a1f63db50f475557d6))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.26.0
    * @kortyx/prompts bumped to 0.2.3
    * @kortyx/usage-telemetry bumped to 0.5.0
    * @kortyx/telemetry-contracts bumped to 0.19.0
  * devDependencies
    * @kortyx/hooks bumped to 0.35.1

## [0.39.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.38.1...agent-v0.39.0) (2026-10-16)


### Features

* **evals:** configurable deadlines and original error visibility ([#354](https://github.com/kortyx-io/kortyx/issues/354)) ([7dde173](https://github.com/kortyx-io/kortyx/commit/7dde173b54eb37a2d28ff28ac342a3333e5ed902))
* **telemetry:** improve failure classification and add CLI usage ([#355](https://github.com/kortyx-io/kortyx/issues/355)) ([c5fbbed](https://github.com/kortyx-io/kortyx/commit/c5fbbed3064ea7b2b3020617db7ce09d1b175db3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.15.0
    * @kortyx/providers bumped to 0.9.4
    * @kortyx/runtime bumped to 0.25.0
    * @kortyx/stream bumped to 0.15.6
    * @kortyx/utils bumped to 0.3.9
    * @kortyx/prompts bumped to 0.2.2
    * @kortyx/usage-telemetry bumped to 0.4.0
    * @kortyx/telemetry-contracts bumped to 0.18.0
  * devDependencies
    * @kortyx/hooks bumped to 0.35.0
    * @kortyx/openai bumped to 0.5.10

## [0.38.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.38.0...agent-v0.38.1) (2026-10-14)


### Bug Fixes

* **runtime:** preserve interrupt state across pauses and resume ([#348](https://github.com/kortyx-io/kortyx/issues/348)) ([03b49f2](https://github.com/kortyx-io/kortyx/commit/03b49f2b8b6b44a2852d16fd4fe1b3e199316072))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.24.1
    * @kortyx/utils bumped to 0.3.8
  * devDependencies
    * @kortyx/hooks bumped to 0.34.3

## [0.38.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.37.1...agent-v0.38.0) (2026-10-13)


### ⚠ BREAKING CHANGES

* **runtime:** Consumer eval routes cap active attempts at 20 by default. Set maxActiveAttempts before upgrading consumers with higher concurrency. Upgrade API and Studio together for the new case-dispatch progress events.
* **agent:** Consumer eval routes cap active attempts at 20 by default. Set maxActiveAttempts before upgrading consumers with higher concurrency. Upgrade API and Studio together for the new case-dispatch progress events.

### Features

* **agent:** make concurrent eval execution resilient ([#339](https://github.com/kortyx-io/kortyx/issues/339)) ([84d0e4f](https://github.com/kortyx-io/kortyx/commit/84d0e4fe3d35e5cf80713f7550ef2b1d83e5a2ec))
* **runtime:** add opt-in workflow data reducers ([#340](https://github.com/kortyx-io/kortyx/issues/340)) ([8be2c81](https://github.com/kortyx-io/kortyx/commit/8be2c81f74c5c51ab98443144f3491d4e8d54a88))


### Bug Fixes

* **evals:** preserve diagnostics and separate postcondition failures ([#337](https://github.com/kortyx-io/kortyx/issues/337)) ([d4fce4e](https://github.com/kortyx-io/kortyx/commit/d4fce4e670971d3b755835fc681c8125f67a9c70))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.14.0
    * @kortyx/providers bumped to 0.9.3
    * @kortyx/runtime bumped to 0.24.0
    * @kortyx/stream bumped to 0.15.5
    * @kortyx/utils bumped to 0.3.7
    * @kortyx/prompts bumped to 0.2.1
    * @kortyx/usage-telemetry bumped to 0.3.0
  * devDependencies
    * @kortyx/hooks bumped to 0.34.2
    * @kortyx/openai bumped to 0.5.9

## [0.37.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.37.0...agent-v0.37.1) (2026-10-13)


### Bug Fixes

* **studio:** show available model cost subtotals everywhere ([#335](https://github.com/kortyx-io/kortyx/issues/335)) ([d19cf5d](https://github.com/kortyx-io/kortyx/commit/d19cf5d7716a7649c738373ba2cea1ef64d532e0))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.23.2
  * devDependencies
    * @kortyx/hooks bumped to 0.34.1

## [0.37.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.36.0...agent-v0.37.0) (2026-10-11)


### Features

* add shared SDK and Studio usage telemetry ([#313](https://github.com/kortyx-io/kortyx/issues/313)) ([7d5f0c0](https://github.com/kortyx-io/kortyx/commit/7d5f0c005bd7721dc6a529554e75c14573d76a0f))


### Bug Fixes

* **website:** reconcile credibility branch with current main ([60199f9](https://github.com/kortyx-io/kortyx/commit/60199f992242eb7c409a95bc7a6898d31bac601d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.13.1
    * @kortyx/providers bumped to 0.9.2
    * @kortyx/runtime bumped to 0.23.1
    * @kortyx/stream bumped to 0.15.4
    * @kortyx/utils bumped to 0.3.6
    * @kortyx/prompts bumped to 0.2.0
    * @kortyx/usage-telemetry bumped to 0.2.0
  * devDependencies
    * @kortyx/hooks bumped to 0.34.0
    * @kortyx/openai bumped to 0.5.8

## [0.36.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.35.0...agent-v0.36.0) (2026-10-10)


### Features

* version, evaluate, serve and migrate Studio prompts ([#288](https://github.com/kortyx-io/kortyx/issues/288)) ([0802f8b](https://github.com/kortyx-io/kortyx/commit/0802f8b91c4a541d176dd8a75c659063e2c28c8c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.23.0
    * @kortyx/prompts bumped to 0.1.0
  * devDependencies
    * @kortyx/hooks bumped to 0.33.0

## [0.35.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.34.0...agent-v0.35.0) (2026-10-09)


### Features

* **evals:** share concurrency and attribute multi-session costs ([#304](https://github.com/kortyx-io/kortyx/issues/304)) ([dd5e242](https://github.com/kortyx-io/kortyx/commit/dd5e242ae08affbb015201bb57c4714709756cf2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.13.0
    * @kortyx/providers bumped to 0.9.1
    * @kortyx/runtime bumped to 0.22.1
    * @kortyx/stream bumped to 0.15.3
    * @kortyx/utils bumped to 0.3.5
  * devDependencies
    * @kortyx/hooks bumped to 0.32.1
    * @kortyx/openai bumped to 0.5.7

## [0.34.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.33.0...agent-v0.34.0) (2026-10-09)


### Features

* **evals:** raise concurrency limit to 20 ([#300](https://github.com/kortyx-io/kortyx/issues/300)) ([0ed3151](https://github.com/kortyx-io/kortyx/commit/0ed3151e2984551d84113091594a0b8f9267289a))

## [0.33.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.32.0...agent-v0.33.0) (2026-10-08)


### Features

* **hooks:** support mixed tools outputs and interrupts ([#297](https://github.com/kortyx-io/kortyx/issues/297)) ([0aa4aa6](https://github.com/kortyx-io/kortyx/commit/0aa4aa6b08cd2ef44f603b8dbe8e35b30c54cbdc))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.22.0
  * devDependencies
    * @kortyx/hooks bumped to 0.32.0

## [0.32.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.31.1...agent-v0.32.0) (2026-10-08)


### Features

* **evals:** compact judge evidence and add suite selection ([#293](https://github.com/kortyx-io/kortyx/issues/293)) ([9754f7c](https://github.com/kortyx-io/kortyx/commit/9754f7cacc61b5945a254ccaa66e17b1b5c8d13f))

## [0.31.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.31.0...agent-v0.31.1) (2026-10-08)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.12.0
    * @kortyx/providers bumped to 0.9.0
    * @kortyx/runtime bumped to 0.21.7
    * @kortyx/stream bumped to 0.15.2
    * @kortyx/utils bumped to 0.3.4
  * devDependencies
    * @kortyx/hooks bumped to 0.31.0
    * @kortyx/openai bumped to 0.5.6

## [0.31.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.30.0...agent-v0.31.0) (2026-10-07)


### Features

* **evals:** group suite runs and expose CLI results ([#284](https://github.com/kortyx-io/kortyx/issues/284)) ([146fd71](https://github.com/kortyx-io/kortyx/commit/146fd71a88587e5591dd0511a4c0cb57969f9d07))

## [0.30.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.29.0...agent-v0.30.0) (2026-10-07)


### Features

* **evals:** diagnose setup and guide first workflow runs ([#275](https://github.com/kortyx-io/kortyx/issues/275)) ([01dbf80](https://github.com/kortyx-io/kortyx/commit/01dbf803e65eec03187de9eaa316e4294f4f8dc5))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.8.4
    * @kortyx/runtime bumped to 0.21.6
    * @kortyx/stream bumped to 0.15.1
  * devDependencies
    * @kortyx/hooks bumped to 0.30.2
    * @kortyx/openai bumped to 0.5.5

## [0.29.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.28.0...agent-v0.29.0) (2026-10-03)


### Features

* **evals:** run conversation suites from Studio and CLI ([#251](https://github.com/kortyx-io/kortyx/issues/251)) ([e653c91](https://github.com/kortyx-io/kortyx/commit/e653c9188d2fad4da0c75e79d090a8dedb639b92))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.21.5
  * devDependencies
    * @kortyx/hooks bumped to 0.30.1

## [0.28.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.27.0...agent-v0.28.0) (2026-09-30)


### Features

* **hooks:** add realtime model-selected output contracts ([#249](https://github.com/kortyx-io/kortyx/issues/249)) ([ac52b47](https://github.com/kortyx-io/kortyx/commit/ac52b47151b64ce5be6ce6c7fd42d34a0fa8a76d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.21.4
    * @kortyx/stream bumped to 0.15.0
  * devDependencies
    * @kortyx/hooks bumped to 0.30.0

## [0.27.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.26.2...agent-v0.27.0) (2026-09-23)


### Features

* **chat:** add server-side transcript lifecycle hooks ([#240](https://github.com/kortyx-io/kortyx/issues/240)) ([f84a674](https://github.com/kortyx-io/kortyx/commit/f84a6749819ee7bab343efb03f38eae743de0655))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.21.3
    * @kortyx/stream bumped to 0.14.0

## [0.26.2](https://github.com/kortyx-io/kortyx/compare/agent-v0.26.1...agent-v0.26.2) (2026-09-22)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.11.0
    * @kortyx/providers bumped to 0.8.3
    * @kortyx/runtime bumped to 0.21.2
    * @kortyx/stream bumped to 0.13.2
    * @kortyx/utils bumped to 0.3.3
  * devDependencies
    * @kortyx/hooks bumped to 0.29.0
    * @kortyx/openai bumped to 0.5.4

## [0.26.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.26.0...agent-v0.26.1) (2026-09-21)


### Bug Fixes

* preserve interrupt control flow and Studio compatibility ([#226](https://github.com/kortyx-io/kortyx/issues/226)) ([72ba7c2](https://github.com/kortyx-io/kortyx/commit/72ba7c2b9a467db0e54b5a4ab5844c8d7f895135))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.10.1
    * @kortyx/providers bumped to 0.8.2
    * @kortyx/runtime bumped to 0.21.1
    * @kortyx/stream bumped to 0.13.1
    * @kortyx/utils bumped to 0.3.2
  * devDependencies
    * @kortyx/hooks bumped to 0.28.1
    * @kortyx/openai bumped to 0.5.3

## [0.26.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.25.1...agent-v0.26.0) (2026-09-21)


### Features

* **hooks:** add model-driven interrupt contracts to useReason ([#224](https://github.com/kortyx-io/kortyx/issues/224)) ([e0147d5](https://github.com/kortyx-io/kortyx/commit/e0147d5234ca38d450d452af924b242f8cbdeb16))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.10.0
    * @kortyx/providers bumped to 0.8.1
    * @kortyx/runtime bumped to 0.21.0
    * @kortyx/stream bumped to 0.13.0
    * @kortyx/utils bumped to 0.3.1
  * devDependencies
    * @kortyx/hooks bumped to 0.28.0
    * @kortyx/openai bumped to 0.5.2

## [0.25.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.25.0...agent-v0.25.1) (2026-09-21)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.20.1
  * devDependencies
    * @kortyx/hooks bumped to 0.27.0

## [0.25.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.24.0...agent-v0.25.0) (2026-09-18)


### Features

* **tools:** add useTool and first-class Studio observability ([#215](https://github.com/kortyx-io/kortyx/issues/215)) ([224c92d](https://github.com/kortyx-io/kortyx/commit/224c92d73caead320dd14582d8b624efc3252c9f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.8.0
    * @kortyx/runtime bumped to 0.20.0
  * devDependencies
    * @kortyx/hooks bumped to 0.26.0
    * @kortyx/openai bumped to 0.5.1

## [0.24.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.23.0...agent-v0.24.0) (2026-09-16)


### Features

* **runtime:** add PostgreSQL persistence, caching composition, and retention ([#207](https://github.com/kortyx-io/kortyx/issues/207)) ([6c1e7df](https://github.com/kortyx-io/kortyx/commit/6c1e7df22ffe8c792bf52b7dba5ae6ea04c1eb2a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.19.0
  * devDependencies
    * @kortyx/hooks bumped to 0.25.3

## [0.23.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.22.2...agent-v0.23.0) (2026-09-16)


### Features

* **runtime:** support durable child calls in parallel DAGs ([#203](https://github.com/kortyx-io/kortyx/issues/203)) ([525e0e7](https://github.com/kortyx-io/kortyx/commit/525e0e7a73fa5f9d78232ca3155d86be7bc1022d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.18.0

## [0.22.2](https://github.com/kortyx-io/kortyx/compare/agent-v0.22.1...agent-v0.22.2) (2026-09-15)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.17.2
  * devDependencies
    * @kortyx/hooks bumped to 0.25.2

## [0.22.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.22.0...agent-v0.22.1) (2026-09-14)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.17.1
  * devDependencies
    * @kortyx/hooks bumped to 0.25.1

## [0.22.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.21.0...agent-v0.22.0) (2026-09-14)


### ⚠ BREAKING CHANGES

* **errors:** public failure messages and default HTTP statuses change; malformed streams fail explicitly, provider error classes are shared, and retry helpers exclude control flow. Existing calls and legacy records remain supported. See the error-contract migration and release notes.

### Features

* **errors:** harden failure contracts across execution and recovery ([#175](https://github.com/kortyx-io/kortyx/issues/175)) ([d231e36](https://github.com/kortyx-io/kortyx/commit/d231e364259a4f23fc3675d8783fde5ba338416e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.9.0
    * @kortyx/providers bumped to 0.7.0
    * @kortyx/runtime bumped to 0.17.0
    * @kortyx/stream bumped to 0.12.0
    * @kortyx/utils bumped to 0.3.0
  * devDependencies
    * @kortyx/hooks bumped to 0.25.0
    * @kortyx/openai bumped to 0.5.0

## [0.21.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.20.1...agent-v0.21.0) (2026-09-11)


### Features

* **hooks:** support durable parallel child workflows ([#171](https://github.com/kortyx-io/kortyx/issues/171)) ([fdf2d56](https://github.com/kortyx-io/kortyx/commit/fdf2d564d88e921988e8f3e20da9fe0c30bbcdf9))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.16.0
  * devDependencies
    * @kortyx/hooks bumped to 0.24.0

## [0.20.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.20.0...agent-v0.20.1) (2026-09-11)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.6.1
    * @kortyx/runtime bumped to 0.15.2
  * devDependencies
    * @kortyx/hooks bumped to 0.23.1

## [0.20.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.19.0...agent-v0.20.0) (2026-09-11)


### ⚠ BREAKING CHANGES

* **openai:** OpenAI now defaults to Responses. Select api: chat-completions on the provider or model to keep the previous transport. Raw payloads remain transport-specific.

### Features

* **openai:** support Responses reasoning tool workflows ([#167](https://github.com/kortyx-io/kortyx/issues/167)) ([b55ba6e](https://github.com/kortyx-io/kortyx/commit/b55ba6e9a16a6f0f39511c4e60961c41f689abd0))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.6.0
    * @kortyx/runtime bumped to 0.15.1
  * devDependencies
    * @kortyx/hooks bumped to 0.23.0

## [0.19.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.18.0...agent-v0.19.0) (2026-09-11)


### Features

* complete client responses while workflows continue in background ([#165](https://github.com/kortyx-io/kortyx/issues/165)) ([a8a08cd](https://github.com/kortyx-io/kortyx/commit/a8a08cd1e9533e4b44efa4af54a2d2cec54431ae))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.15.0
  * devDependencies
    * @kortyx/hooks bumped to 0.22.0

## [0.18.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.17.0...agent-v0.18.0) (2026-09-10)


### Features

* **runtime:** add shared execution limits and checkpoint continuation ([#163](https://github.com/kortyx-io/kortyx/issues/163)) ([e22232c](https://github.com/kortyx-io/kortyx/commit/e22232c059fae4f7df1bd36423902bd365887942))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.8.0
    * @kortyx/runtime bumped to 0.14.0
    * @kortyx/stream bumped to 0.11.0
  * devDependencies
    * @kortyx/hooks bumped to 0.21.0

## [0.17.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.16.0...agent-v0.17.0) (2026-09-10)


### Features

* cancel workflow trees and reflect cancellation in Studio ([#161](https://github.com/kortyx-io/kortyx/issues/161)) ([699ad18](https://github.com/kortyx-io/kortyx/commit/699ad18905955c6340c3d85b9fae7f0bffd00a0d))
* execute and resume workflows without chat transport ([#159](https://github.com/kortyx-io/kortyx/issues/159)) ([6decb17](https://github.com/kortyx-io/kortyx/commit/6decb1714fedc021ac9e125b6ed9f75475ed928a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.7.0
    * @kortyx/runtime bumped to 0.13.0
    * @kortyx/stream bumped to 0.10.0
  * devDependencies
    * @kortyx/hooks bumped to 0.20.0

## [0.16.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.15.0...agent-v0.16.0) (2026-09-09)


### Features

* add resumable child workflows and Studio inspection ([#157](https://github.com/kortyx-io/kortyx/issues/157)) ([542ba29](https://github.com/kortyx-io/kortyx/commit/542ba29b3b57217e6e5d98c1b409bbec5ce3261f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.6.0
    * @kortyx/runtime bumped to 0.12.0
  * devDependencies
    * @kortyx/hooks bumped to 0.19.0

## [0.15.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.14.2...agent-v0.15.0) (2026-08-02)


### Features

* **studio:** release self-hosted observability preview ([4e9d3fd](https://github.com/kortyx-io/kortyx/commit/4e9d3fdbc7233f9b1de94ca1afe6dbae9cc9157f))
* **studio:** release self-hosted observability preview ([#139](https://github.com/kortyx-io/kortyx/issues/139)) ([4e9d3fd](https://github.com/kortyx-io/kortyx/commit/4e9d3fdbc7233f9b1de94ca1afe6dbae9cc9157f))
* **telemetry:** add persisted studio read models ([cebb06b](https://github.com/kortyx-io/kortyx/commit/cebb06bb74ccd4422e263f0ff4efa0fee5a16240))


### Bug Fixes

* harden interrupt lifecycle semantics ([958d149](https://github.com/kortyx-io/kortyx/commit/958d149596d54215821ef5a7f8562a06a7459149))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.11.1
  * devDependencies
    * @kortyx/hooks bumped to 0.18.0

## [0.14.2](https://github.com/kortyx-io/kortyx/compare/agent-v0.14.1...agent-v0.14.2) (2026-06-12)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.11.0

## [0.14.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.14.0...agent-v0.14.1) (2026-05-28)


### Bug Fixes

* pass same metadata as useReason ([7b08754](https://github.com/kortyx-io/kortyx/commit/7b087542e54e9b0fe51bd3596a787dee41d5544a))
* pass same metadata as useReason ([5540ef4](https://github.com/kortyx-io/kortyx/commit/5540ef4b0a339fd43b09721b826f6b01a670c2a7))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.10.3
  * devDependencies
    * @kortyx/hooks bumped to 0.17.1

## [0.14.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.13.1...agent-v0.14.0) (2026-05-26)


### Features

* **agent:** expose run trace ids in streams ([50521cd](https://github.com/kortyx-io/kortyx/commit/50521cd27d58cd66d93cf19a88d160c0cd0b3ec4))
* **agent:** expose run trace ids in streams ([260e96e](https://github.com/kortyx-io/kortyx/commit/260e96e72018eac5a3f91c36ed661abf11a1caf4))


### Bug Fixes

* preserve spacing when flattening text streams ([b3693d8](https://github.com/kortyx-io/kortyx/commit/b3693d8f8d495504e94ab210a496cf138615418a))
* preserve spacing when flattening text streams ([8cc1daa](https://github.com/kortyx-io/kortyx/commit/8cc1daac05a81fc40f07a19bd96dc429fd761251))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.10.2
    * @kortyx/stream bumped to 0.9.0
  * devDependencies
    * @kortyx/hooks bumped to 0.17.0

## [0.13.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.13.0...agent-v0.13.1) (2026-05-26)


### Bug Fixes

* **agent:** expose run span chat io to trace adapters ([250b473](https://github.com/kortyx-io/kortyx/commit/250b473c10658908e773c34b2861e11804676dbb))

## [0.13.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.12.0...agent-v0.13.0) (2026-05-25)


### Features

* add MCP tool support to useReason ([8352721](https://github.com/kortyx-io/kortyx/commit/83527215fd2fa6362348d842f8f3b9e9d9d03704))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.5.0
    * @kortyx/runtime bumped to 0.10.1
    * @kortyx/stream bumped to 0.8.0
  * devDependencies
    * @kortyx/hooks bumped to 0.16.0

## [0.12.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.11.3...agent-v0.12.0) (2026-05-24)


### Features

* add OpenTelemetry tracing adapter ([dc1218f](https://github.com/kortyx-io/kortyx/commit/dc1218fb3759b8cb467f6c58f953a80127b25783))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.10.0
  * devDependencies
    * @kortyx/hooks bumped to 0.15.0

## [0.11.3](https://github.com/kortyx-io/kortyx/compare/agent-v0.11.2...agent-v0.11.3) (2026-05-22)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.9.6
  * devDependencies
    * @kortyx/hooks bumped to 0.14.0

## [0.11.2](https://github.com/kortyx-io/kortyx/compare/agent-v0.11.1...agent-v0.11.2) (2026-05-22)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.9.5
  * devDependencies
    * @kortyx/hooks bumped to 0.13.0

## [0.11.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.11.0...agent-v0.11.1) (2026-05-22)


### Bug Fixes

* **runtime:** enforce node error contract ([3af7fa9](https://github.com/kortyx-io/kortyx/commit/3af7fa9c363637bb804f4a3df7a9b68070eecce3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.5.3
    * @kortyx/runtime bumped to 0.9.4
  * devDependencies
    * @kortyx/hooks bumped to 0.12.1

## [0.11.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.10.3...agent-v0.11.0) (2026-05-20)


### Features

* **chat:** add request context plumbing ([7210a6f](https://github.com/kortyx-io/kortyx/commit/7210a6f9275728628e1862bd7b0f200112bd9b08))


### Bug Fixes

* **agent:** strengthen coverage for orchestration paths ([01f1542](https://github.com/kortyx-io/kortyx/commit/01f1542416e8079b92e5b2390840e18b3a8e351c))
* **agent:** strengthen coverage for orchestration paths ([7c52d00](https://github.com/kortyx-io/kortyx/commit/7c52d00d4538f832cededcd3bd7b86e88b12ddfa))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.5.2
    * @kortyx/runtime bumped to 0.9.3
    * @kortyx/stream bumped to 0.7.0
    * @kortyx/utils bumped to 0.2.6
  * devDependencies
    * @kortyx/hooks bumped to 0.12.0

## [0.10.3](https://github.com/kortyx-io/kortyx/compare/agent-v0.10.2...agent-v0.10.3) (2026-05-04)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/runtime bumped to 0.9.2
  * devDependencies
    * @kortyx/hooks bumped to 0.11.0

## [0.10.2](https://github.com/kortyx-io/kortyx/compare/agent-v0.10.1...agent-v0.10.2) (2026-05-03)


### Bug Fixes

* update vulnerable dependency versions ([274bc41](https://github.com/kortyx-io/kortyx/commit/274bc410fe04d53da9db941ef8d62407dadd4c54))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.5.1
    * @kortyx/runtime bumped to 0.9.1
  * devDependencies
    * @kortyx/hooks bumped to 0.10.1

## [0.10.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.10.0...agent-v0.10.1) (2026-04-25)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.4.0
    * @kortyx/runtime bumped to 0.9.0
  * devDependencies
    * @kortyx/hooks bumped to 0.10.0

## [0.10.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.9.1...agent-v0.10.0) (2026-04-17)


### Features

* **hooks:** support incremental structured data streaming ([05e9678](https://github.com/kortyx-io/kortyx/commit/05e96789a9a132549c9245b1feb76d20916da42a))
* **hooks:** support incremental structured data streaming ([05e9678](https://github.com/kortyx-io/kortyx/commit/05e96789a9a132549c9245b1feb76d20916da42a))
* **hooks:** support incremental structured data streaming ([4023fda](https://github.com/kortyx-io/kortyx/commit/4023fda42bfecc81782e474e6d442b379a3fa3d4))

## [0.9.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.9.0...agent-v0.9.1) (2026-04-12)


### Bug Fixes

* **agent:** support sequential interrupts across resume ([f56b092](https://github.com/kortyx-io/kortyx/commit/f56b092e2738c084695ba9d1eed3fbfb3d400dc8))
* **agent:** support sequential interrupts across resume ([b22d84e](https://github.com/kortyx-io/kortyx/commit/b22d84e3a805f2bc350b49ad7d9b68c1124439de))

## [0.9.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.8.0...agent-v0.9.0) (2026-03-11)


### ⚠ BREAKING CHANGES

* remove @kortyx/memory and clarify runtime persistence

### Bug Fixes

* **dx:** simplify streamChat API route surface and docs ([6ac69da](https://github.com/kortyx-io/kortyx/commit/6ac69da30945e48d251b3f16b979177cf5a4d108))
* **dx:** simplify streamChat API route surface and docs ([ec6599a](https://github.com/kortyx-io/kortyx/commit/ec6599a5b745d2ec22d77a0ede4d730ddd4d261a))
* remove @kortyx/memory and clarify runtime persistence ([613574d](https://github.com/kortyx-io/kortyx/commit/613574d535de680a7b9671e801613a8222052dd5))

## [0.8.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.7.0...agent-v0.8.0) (2026-03-09)


### ⚠ BREAKING CHANGES

* **agent:** simplify createAgent workflow defaults

### Features

* **agent:** simplify createAgent workflow defaults ([d3afbc7](https://github.com/kortyx-io/kortyx/commit/d3afbc77de61ca71c938c78349f383cd346aad99))


### Bug Fixes

* **release:** rollback accidental 1.0 release commit ([16fa5db](https://github.com/kortyx-io/kortyx/commit/16fa5db300c63d4c985a7475ea8375d9b365b925))

## [0.7.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.6.1...agent-v0.7.0) (2026-03-08)


### Features

* **runtime:** rename graph compiler API and remove LangGraph wording ([43ecfec](https://github.com/kortyx-io/kortyx/commit/43ecfec6f1235fad01344a52c68aeeb1a6636a52))

## [0.6.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.6.0...agent-v0.6.1) (2026-02-17)


### Bug Fixes

* **release:** publish packages with pnpm and public access ([357e268](https://github.com/kortyx-io/kortyx/commit/357e2680469e729ea58d103915989142f668a39a))
* **release:** publish packages with pnpm and public access ([5ef7498](https://github.com/kortyx-io/kortyx/commit/5ef7498330129f376ca7197b70cb7b6a38138e8a))

## [0.6.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.5.1...agent-v0.6.0) (2026-02-17)


### Features

* **hooks:** consolidate reason+interrupt contracts ([4716a4d](https://github.com/kortyx-io/kortyx/commit/4716a4d4739b4a71b7c6e84717c830cd9ff625a6))


### Bug Fixes

* **hooks:** stabilize useReason interrupt resume and split internals ([fa24712](https://github.com/kortyx-io/kortyx/commit/fa247129f160d129cdf2c05f0a48a2236ea71bb8))

## [0.5.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.5.0...agent-v0.5.1) (2026-02-17)


### Bug Fixes

* **build:** align package tsconfig with shared lib baseline ([48d2b57](https://github.com/kortyx-io/kortyx/commit/48d2b5765fefbb5fcbbe548e749e7b5f51b450b9))
* **build:** wire tsup for publishable packages ([e7b1b5c](https://github.com/kortyx-io/kortyx/commit/e7b1b5c28af55becffc137233dd92d8953d7cb8e))
* **dev:** restore tsc watch flow for local workspace ([4305823](https://github.com/kortyx-io/kortyx/commit/430582372cad466bf28af554042aa11bdb8bf027))

## [0.5.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.4.1...agent-v0.5.0) (2026-02-17)


### Features

* **agent:** strict createAgent and unify useReason streaming ([6725f97](https://github.com/kortyx-io/kortyx/commit/6725f976fc32083fb7d2590f1353d16a99afb46f))
* **kortyx:** add browser-safe chat streaming adapters ([c7eb98e](https://github.com/kortyx-io/kortyx/commit/c7eb98e06781a708c79f143ba725efb69d35709e))
* make createAgent strict/declarative and split providers ([1d252f2](https://github.com/kortyx-io/kortyx/commit/1d252f2dcd51622f821715c0fffb13733aeb3cae))


### Bug Fixes

* **agent:** remove eager provider registration guard ([8da4059](https://github.com/kortyx-io/kortyx/commit/8da40592d55bb31800a4d85edcd49795ddf09a29))
* **agent:** simplify stream transformer and interrupt orchestration ([d0b5847](https://github.com/kortyx-io/kortyx/commit/d0b58475e139e070fd9ca1a68b71395642ac32d5))

## [0.4.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.4.0...agent-v0.4.1) (2026-02-15)


### Bug Fixes

* remove kortyx.config support and update docs ([ecb3f8d](https://github.com/kortyx-io/kortyx/commit/ecb3f8d53a017cc84bf8db3e125a6f711f5d4013))
* remove kortyx.config support and update docs ([aa4a70a](https://github.com/kortyx-io/kortyx/commit/aa4a70a034dfec7bca829793f1729c51be018ae2))

## [0.4.0](https://github.com/kortyx-io/Kortyx/compare/agent-v0.3.0...agent-v0.4.0) (2026-02-07)


### Features

* **runtime:** framework persistence adapter ([8383ad2](https://github.com/kortyx-io/Kortyx/commit/8383ad2d73754ccf4daf33e414e15c3ce44df8cb))


### Bug Fixes

* **agent:** remove explicit any in chat flow ([fcd701c](https://github.com/kortyx-io/Kortyx/commit/fcd701cfb6cb5f037900bbf0b396230603d16877))

## [0.3.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.2.2...agent-v0.3.0) (2026-01-25)


### Features

* add new example project ([dae4ad0](https://github.com/kortyx-io/kortyx/commit/dae4ad00f2e987ecb71f863bfc776ea7e19e2430))


### Bug Fixes

* package scripts and dist ([0ed75d3](https://github.com/kortyx-io/kortyx/commit/0ed75d362230a5eddc83b269d14cb787fbf84fb8))

## [0.2.2](https://github.com/kortyx-io/kortyx/compare/agent-v0.2.1...agent-v0.2.2) (2026-01-22)


### Bug Fixes

* add repo info ([e1faa47](https://github.com/kortyx-io/kortyx/commit/e1faa4704c35e9ca7f9bbfd85ab8672f94d389bd))

## [0.2.1](https://github.com/kortyx-io/kortyx/compare/agent-v0.2.0...agent-v0.2.1) (2026-01-22)


### Bug Fixes

* test release ([42228be](https://github.com/kortyx-io/kortyx/commit/42228be5fad0993d06f8fd941bd4a1640a7712d9))

## [0.2.0](https://github.com/kortyx-io/kortyx/compare/agent-v0.1.0...agent-v0.2.0) (2026-01-21)


### Features

* create kortyx packages ([fb9d281](https://github.com/kortyx-io/kortyx/commit/fb9d281e92e885fcfc2948dc1ee9701e881f7321))
