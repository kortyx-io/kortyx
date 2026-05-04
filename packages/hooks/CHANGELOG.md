# Changelog

## [0.11.0](https://github.com/kortyx-io/kortyx/compare/hooks-v0.10.1...hooks-v0.11.0) (2026-05-04)


### Features

* add optional useReason interrupts ([99414c0](https://github.com/kortyx-io/kortyx/commit/99414c0c32a43ccde5b871c706d2a1211e7feac1))
* add optional useReason interrupts ([02d852d](https://github.com/kortyx-io/kortyx/commit/02d852d02cbe38ca3491db8e52ca7a9d8fc005f2))

## [0.10.1](https://github.com/kortyx-io/kortyx/compare/hooks-v0.10.0...hooks-v0.10.1) (2026-05-03)


### Bug Fixes

* update vulnerable dependency versions ([274bc41](https://github.com/kortyx-io/kortyx/commit/274bc410fe04d53da9db941ef8d62407dadd4c54))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.5.1

## [0.10.0](https://github.com/kortyx-io/kortyx/compare/hooks-v0.9.1...hooks-v0.10.0) (2026-04-25)


### Features

* **google, hooks:** reasoning fallback and structured reason parsing ([b12d404](https://github.com/kortyx-io/kortyx/commit/b12d404d42c184f5dd076d00ccf8af28bb463d45))
* **hooks:** track reason usage and tracing spans ([7dd9bf1](https://github.com/kortyx-io/kortyx/commit/7dd9bf1a207c7ce127cb64a090cf9b123924d1c6))
* **providers:** normalize reason model call metadata ([1a59e64](https://github.com/kortyx-io/kortyx/commit/1a59e6438c555a7536128501114a1382e6f90be4))
* **providers:** use provider instances in model refs ([e6183f0](https://github.com/kortyx-io/kortyx/commit/e6183f06b17c66e35cc336ef05019148ac631390))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.4.0

## [0.9.1](https://github.com/kortyx-io/kortyx/compare/hooks-v0.9.0...hooks-v0.9.1) (2026-04-22)


### Bug Fixes

* **stream:** enforce structured chunk contract semantics ([bdbc518](https://github.com/kortyx-io/kortyx/commit/bdbc518366baacddb1a2ebb890b19e6564e2bee4))
* **stream:** enforce structured chunk contract semantics ([249d6e4](https://github.com/kortyx-io/kortyx/commit/249d6e47e1960debb0f396a4e7251bf9df38d7d2))

## [0.9.0](https://github.com/kortyx-io/kortyx/compare/hooks-v0.8.0...hooks-v0.9.0) (2026-04-17)


### Features

* **hooks:** support incremental structured data streaming ([05e9678](https://github.com/kortyx-io/kortyx/commit/05e96789a9a132549c9245b1feb76d20916da42a))
* **hooks:** support incremental structured data streaming ([05e9678](https://github.com/kortyx-io/kortyx/commit/05e96789a9a132549c9245b1feb76d20916da42a))
* **hooks:** support incremental structured data streaming ([4023fda](https://github.com/kortyx-io/kortyx/commit/4023fda42bfecc81782e474e6d442b379a3fa3d4))

## [0.8.0](https://github.com/kortyx-io/kortyx/compare/hooks-v0.7.0...hooks-v0.8.0) (2026-03-11)


### ⚠ BREAKING CHANGES

* remove @kortyx/memory and clarify runtime persistence

### Bug Fixes

* **dx:** simplify streamChat API route surface and docs ([6ac69da](https://github.com/kortyx-io/kortyx/commit/6ac69da30945e48d251b3f16b979177cf5a4d108))
* remove @kortyx/memory and clarify runtime persistence ([613574d](https://github.com/kortyx-io/kortyx/commit/613574d535de680a7b9671e801613a8222052dd5))

## [0.7.0](https://github.com/kortyx-io/kortyx/compare/hooks-v0.6.0...hooks-v0.7.0) (2026-03-09)


### ⚠ BREAKING CHANGES

* **hooks:** remove useEmit from public API
* **hooks:** remove keyed useNodeState API

### Features

* **hooks:** remove keyed useNodeState API ([1692d64](https://github.com/kortyx-io/kortyx/commit/1692d648f643471aebb67ed2c26ff4f4cb6fd931))
* **hooks:** remove useEmit from public API ([c66e3b0](https://github.com/kortyx-io/kortyx/commit/c66e3b012eb822a14067ee0e6f40528fcc7b4711))


### Bug Fixes

* **release:** rollback accidental 1.0 release commit ([16fa5db](https://github.com/kortyx-io/kortyx/commit/16fa5db300c63d4c985a7475ea8375d9b365b925))

## [0.6.0](https://github.com/kortyx-io/kortyx/compare/hooks-v0.5.1...hooks-v0.6.0) (2026-03-08)


### Features

* **runtime:** rename graph compiler API and remove LangGraph wording ([43ecfec](https://github.com/kortyx-io/kortyx/commit/43ecfec6f1235fad01344a52c68aeeb1a6636a52))

## [0.5.1](https://github.com/kortyx-io/kortyx/compare/hooks-v0.5.0...hooks-v0.5.1) (2026-02-17)


### Bug Fixes

* **hooks:** fix hooks-core test typing ([2941610](https://github.com/kortyx-io/kortyx/commit/2941610a1d28509f7e42f894decd37d6c95bc308))
* **release:** publish packages with pnpm and public access ([357e268](https://github.com/kortyx-io/kortyx/commit/357e2680469e729ea58d103915989142f668a39a))
* **release:** publish packages with pnpm and public access ([5ef7498](https://github.com/kortyx-io/kortyx/commit/5ef7498330129f376ca7197b70cb7b6a38138e8a))

## [0.5.0](https://github.com/kortyx-io/kortyx/compare/hooks-v0.4.1...hooks-v0.5.0) (2026-02-17)


### Features

* **hooks:** consolidate reason+interrupt contracts ([4716a4d](https://github.com/kortyx-io/kortyx/commit/4716a4d4739b4a71b7c6e84717c830cd9ff625a6))


### Bug Fixes

* **hooks:** stabilize useReason interrupt resume and split internals ([fa24712](https://github.com/kortyx-io/kortyx/commit/fa247129f160d129cdf2c05f0a48a2236ea71bb8))
* **testing:** add hooks vitest suite and enforce CI test gates ([d3ecdcb](https://github.com/kortyx-io/kortyx/commit/d3ecdcbd0c9e48d88231f0a75eb3b3b2339e9d6d))

## [0.4.1](https://github.com/kortyx-io/kortyx/compare/hooks-v0.4.0...hooks-v0.4.1) (2026-02-17)


### Bug Fixes

* **build:** align package tsconfig with shared lib baseline ([48d2b57](https://github.com/kortyx-io/kortyx/commit/48d2b5765fefbb5fcbbe548e749e7b5f51b450b9))
* **build:** wire tsup for publishable packages ([e7b1b5c](https://github.com/kortyx-io/kortyx/commit/e7b1b5c28af55becffc137233dd92d8953d7cb8e))
* **dev:** restore tsc watch flow for local workspace ([4305823](https://github.com/kortyx-io/kortyx/commit/430582372cad466bf28af554042aa11bdb8bf027))

## [0.4.0](https://github.com/kortyx-io/kortyx/compare/hooks-v0.3.0...hooks-v0.4.0) (2026-02-17)


### Features

* **agent:** strict createAgent and unify useReason streaming ([6725f97](https://github.com/kortyx-io/kortyx/commit/6725f976fc32083fb7d2590f1353d16a99afb46f))


### Bug Fixes

* **hooks:** move reason engine to internal subpath export ([b82f2f2](https://github.com/kortyx-io/kortyx/commit/b82f2f2a93067f91dd010334486eb0f3a3a547b8))

## [0.3.0](https://github.com/kortyx-io/Kortyx/compare/hooks-v0.2.3...hooks-v0.3.0) (2026-02-07)


### Features

* **runtime:** framework persistence adapter ([8383ad2](https://github.com/kortyx-io/Kortyx/commit/8383ad2d73754ccf4daf33e414e15c3ce44df8cb))

## [0.2.3](https://github.com/kortyx-io/kortyx/compare/hooks-v0.2.2...hooks-v0.2.3) (2026-01-25)


### Bug Fixes

* package scripts and dist ([0ed75d3](https://github.com/kortyx-io/kortyx/commit/0ed75d362230a5eddc83b269d14cb787fbf84fb8))

## [0.2.2](https://github.com/kortyx-io/kortyx/compare/hooks-v0.2.1...hooks-v0.2.2) (2026-01-22)


### Bug Fixes

* add repo info ([e1faa47](https://github.com/kortyx-io/kortyx/commit/e1faa4704c35e9ca7f9bbfd85ab8672f94d389bd))

## [0.2.1](https://github.com/kortyx-io/kortyx/compare/hooks-v0.2.0...hooks-v0.2.1) (2026-01-22)


### Bug Fixes

* test release ([42228be](https://github.com/kortyx-io/kortyx/commit/42228be5fad0993d06f8fd941bd4a1640a7712d9))

## [0.2.0](https://github.com/kortyx-io/kortyx/compare/hooks-v0.1.0...hooks-v0.2.0) (2026-01-21)


### Features

* create kortyx packages ([fb9d281](https://github.com/kortyx-io/kortyx/commit/fb9d281e92e885fcfc2948dc1ee9701e881f7321))
