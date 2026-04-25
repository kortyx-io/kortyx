# Changelog

## [0.9.1](https://github.com/kortyx-io/kortyx/compare/kortyx-v0.9.0...kortyx-v0.9.1) (2026-04-25)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/agent bumped to 0.10.1
    * @kortyx/hooks bumped to 0.10.0
    * @kortyx/providers bumped to 0.4.0
    * @kortyx/runtime bumped to 0.9.0

## [0.9.0](https://github.com/kortyx-io/kortyx/compare/kortyx-v0.8.0...kortyx-v0.9.0) (2026-04-17)


### Features

* **hooks:** support incremental structured data streaming ([05e9678](https://github.com/kortyx-io/kortyx/commit/05e96789a9a132549c9245b1feb76d20916da42a))
* **hooks:** support incremental structured data streaming ([05e9678](https://github.com/kortyx-io/kortyx/commit/05e96789a9a132549c9245b1feb76d20916da42a))
* **hooks:** support incremental structured data streaming ([4023fda](https://github.com/kortyx-io/kortyx/commit/4023fda42bfecc81782e474e6d442b379a3fa3d4))

## [0.8.0](https://github.com/kortyx-io/kortyx/compare/kortyx-v0.7.0...kortyx-v0.8.0) (2026-03-11)


### ⚠ BREAKING CHANGES

* remove @kortyx/memory and clarify runtime persistence

### Bug Fixes

* **dx:** simplify streamChat API route surface and docs ([6ac69da](https://github.com/kortyx-io/kortyx/commit/6ac69da30945e48d251b3f16b979177cf5a4d108))
* **dx:** simplify streamChat API route surface and docs ([ec6599a](https://github.com/kortyx-io/kortyx/commit/ec6599a5b745d2ec22d77a0ede4d730ddd4d261a))
* remove @kortyx/memory and clarify runtime persistence ([613574d](https://github.com/kortyx-io/kortyx/commit/613574d535de680a7b9671e801613a8222052dd5))

## [0.7.0](https://github.com/kortyx-io/kortyx/compare/kortyx-v0.6.0...kortyx-v0.7.0) (2026-03-09)


### ⚠ BREAKING CHANGES

* **hooks:** remove useEmit from public API
* **agent:** simplify createAgent workflow defaults

### Features

* **agent:** simplify createAgent workflow defaults ([d3afbc7](https://github.com/kortyx-io/kortyx/commit/d3afbc77de61ca71c938c78349f383cd346aad99))
* **hooks:** remove useEmit from public API ([c66e3b0](https://github.com/kortyx-io/kortyx/commit/c66e3b012eb822a14067ee0e6f40528fcc7b4711))


### Bug Fixes

* **release:** rollback accidental 1.0 release commit ([16fa5db](https://github.com/kortyx-io/kortyx/commit/16fa5db300c63d4c985a7475ea8375d9b365b925))

## [0.6.0](https://github.com/kortyx-io/kortyx/compare/kortyx-v0.5.1...kortyx-v0.6.0) (2026-03-08)


### Features

* **stream:** add consumeStream and improve nextjs chat DX ([6a544cc](https://github.com/kortyx-io/kortyx/commit/6a544cc827aace25b2953a290809eccda37f37f8))

## [0.5.1](https://github.com/kortyx-io/kortyx/compare/kortyx-v0.5.0...kortyx-v0.5.1) (2026-02-17)


### Bug Fixes

* **release:** publish packages with pnpm and public access ([357e268](https://github.com/kortyx-io/kortyx/commit/357e2680469e729ea58d103915989142f668a39a))
* **release:** publish packages with pnpm and public access ([5ef7498](https://github.com/kortyx-io/kortyx/commit/5ef7498330129f376ca7197b70cb7b6a38138e8a))

## [0.5.0](https://github.com/kortyx-io/kortyx/compare/kortyx-v0.4.1...kortyx-v0.5.0) (2026-02-17)


### Features

* **hooks:** consolidate reason+interrupt contracts ([4716a4d](https://github.com/kortyx-io/kortyx/commit/4716a4d4739b4a71b7c6e84717c830cd9ff625a6))

## [0.4.1](https://github.com/kortyx-io/kortyx/compare/kortyx-v0.4.0...kortyx-v0.4.1) (2026-02-17)


### Bug Fixes

* **build:** align package tsconfig with shared lib baseline ([48d2b57](https://github.com/kortyx-io/kortyx/commit/48d2b5765fefbb5fcbbe548e749e7b5f51b450b9))
* **build:** wire tsup for publishable packages ([e7b1b5c](https://github.com/kortyx-io/kortyx/commit/e7b1b5c28af55becffc137233dd92d8953d7cb8e))
* **dev:** restore tsc watch flow for local workspace ([4305823](https://github.com/kortyx-io/kortyx/commit/430582372cad466bf28af554042aa11bdb8bf027))

## [0.4.0](https://github.com/kortyx-io/kortyx/compare/kortyx-v0.3.1...kortyx-v0.4.0) (2026-02-17)


### Features

* **agent:** strict createAgent and unify useReason streaming ([6725f97](https://github.com/kortyx-io/kortyx/commit/6725f976fc32083fb7d2590f1353d16a99afb46f))
* **kortyx:** add browser-safe chat streaming adapters ([c7eb98e](https://github.com/kortyx-io/kortyx/commit/c7eb98e06781a708c79f143ba725efb69d35709e))
* make createAgent strict/declarative and split providers ([1d252f2](https://github.com/kortyx-io/kortyx/commit/1d252f2dcd51622f821715c0fffb13733aeb3cae))

## [0.3.1](https://github.com/kortyx-io/kortyx/compare/kortyx-v0.3.0...kortyx-v0.3.1) (2026-02-15)


### Bug Fixes

* remove kortyx.config support and update docs ([ecb3f8d](https://github.com/kortyx-io/kortyx/commit/ecb3f8d53a017cc84bf8db3e125a6f711f5d4013))
* remove kortyx.config support and update docs ([aa4a70a](https://github.com/kortyx-io/kortyx/commit/aa4a70a034dfec7bca829793f1729c51be018ae2))

## [0.3.0](https://github.com/kortyx-io/Kortyx/compare/kortyx-v0.2.3...kortyx-v0.3.0) (2026-02-07)


### Features

* **kortyx:** add browser-safe exports for client bundles ([5d9b50c](https://github.com/kortyx-io/Kortyx/commit/5d9b50c9520114822b868d08c2c001bbf85f7bcf))
* **kortyx:** export node registry and stream utilities ([9206ffd](https://github.com/kortyx-io/Kortyx/commit/9206ffd98e68ded8fe7b024548149dc31a154259))
* **runtime:** framework persistence adapter ([8383ad2](https://github.com/kortyx-io/Kortyx/commit/8383ad2d73754ccf4daf33e414e15c3ce44df8cb))

## [0.2.3](https://github.com/kortyx-io/kortyx/compare/kortyx-v0.2.2...kortyx-v0.2.3) (2026-01-25)


### Bug Fixes

* package scripts and dist ([0ed75d3](https://github.com/kortyx-io/kortyx/commit/0ed75d362230a5eddc83b269d14cb787fbf84fb8))

## [0.2.2](https://github.com/kortyx-io/kortyx/compare/kortyx-v0.2.1...kortyx-v0.2.2) (2026-01-22)


### Bug Fixes

* add repo info ([e1faa47](https://github.com/kortyx-io/kortyx/commit/e1faa4704c35e9ca7f9bbfd85ab8672f94d389bd))

## [0.2.1](https://github.com/kortyx-io/kortyx/compare/kortyx-v0.2.0...kortyx-v0.2.1) (2026-01-22)


### Bug Fixes

* test release ([42228be](https://github.com/kortyx-io/kortyx/commit/42228be5fad0993d06f8fd941bd4a1640a7712d9))

## [0.2.0](https://github.com/kortyx-io/kortyx/compare/kortyx-v0.1.0...kortyx-v0.2.0) (2026-01-21)


### Features

* create kortyx packages ([fb9d281](https://github.com/kortyx-io/kortyx/commit/fb9d281e92e885fcfc2948dc1ee9701e881f7321))
