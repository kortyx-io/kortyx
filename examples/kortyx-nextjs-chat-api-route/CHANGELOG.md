# Changelog

## [0.11.0](https://github.com/kortyx-io/kortyx/compare/example-nextjs-chat-api-route-v0.10.0...example-nextjs-chat-api-route-v0.11.0) (2026-04-25)


### Features

* **google, hooks:** reasoning fallback and structured reason parsing ([b12d404](https://github.com/kortyx-io/kortyx/commit/b12d404d42c184f5dd076d00ccf8af28bb463d45))
* **google:** add default provider export and docs ([174e566](https://github.com/kortyx-io/kortyx/commit/174e566db6f6727c2591b1146beccacb218335b7))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/google bumped to 0.3.0
    * kortyx bumped to 0.9.1

## [0.10.0](https://github.com/kortyx-io/kortyx/compare/example-nextjs-chat-api-route-v0.9.0...example-nextjs-chat-api-route-v0.10.0) (2026-04-23)


### Features

* **react:** add assistant message builder ([56a8878](https://github.com/kortyx-io/kortyx/commit/56a88785961526293ad79ca9e6154385a09b3f66))
* **react:** add chat stream debug hook ([0117fa1](https://github.com/kortyx-io/kortyx/commit/0117fa13e630aff5fc658b8802eaddc312005730))
* **react:** add chat transport and browser storage helpers ([fb7a37a](https://github.com/kortyx-io/kortyx/commit/fb7a37a85a9c19f0342ccbb527ecf132eb4f74c8))
* **react:** add chat types and interrupt mapping helpers ([7da61dd](https://github.com/kortyx-io/kortyx/commit/7da61dd81ba6276162ee8580a9342b32da7e70d6))
* **react:** add live chat pieces helper ([1052969](https://github.com/kortyx-io/kortyx/commit/10529698f92c26b2e673f6477707f0ca918047e4))
* **react:** add structured stream hooks package ([5c2abd2](https://github.com/kortyx-io/kortyx/commit/5c2abd227f0def674ad099fffe2f7e8b3afbee42))
* **react:** add useChat hook ([4a277b1](https://github.com/kortyx-io/kortyx/commit/4a277b1b806b9d5e4781f3dc9c90b16e928cc76d))


### Bug Fixes

* **examples:** add pluggable chat storage adapters ([a05c9e3](https://github.com/kortyx-io/kortyx/commit/a05c9e364f31d1c08fc0f36776db48059ae33c91))
* **examples:** extract assistant message builder ([f2d0aaa](https://github.com/kortyx-io/kortyx/commit/f2d0aaab3bbc1f10f9f4caacd39906fef0e829e9))
* **examples:** extract interrupt piece mapping ([5b966c1](https://github.com/kortyx-io/kortyx/commit/5b966c171a032da128467fa400b1239c417bfbbf))
* **examples:** separate chat stream responsibilities ([8a99132](https://github.com/kortyx-io/kortyx/commit/8a99132fe00f8e6f61bd83f790fd2392e8174306))

## [0.9.0](https://github.com/kortyx-io/kortyx/compare/example-nextjs-chat-api-route-v0.8.1...example-nextjs-chat-api-route-v0.9.0) (2026-04-17)


### Features

* **hooks:** support incremental structured data streaming ([05e9678](https://github.com/kortyx-io/kortyx/commit/05e96789a9a132549c9245b1feb76d20916da42a))
* **hooks:** support incremental structured data streaming ([05e9678](https://github.com/kortyx-io/kortyx/commit/05e96789a9a132549c9245b1feb76d20916da42a))
* **hooks:** support incremental structured data streaming ([4023fda](https://github.com/kortyx-io/kortyx/commit/4023fda42bfecc81782e474e6d442b379a3fa3d4))

## [0.8.1](https://github.com/kortyx-io/kortyx/compare/example-nextjs-chat-api-route-v0.8.0...example-nextjs-chat-api-route-v0.8.1) (2026-04-12)


### Bug Fixes

* **agent:** support sequential interrupts across resume ([f56b092](https://github.com/kortyx-io/kortyx/commit/f56b092e2738c084695ba9d1eed3fbfb3d400dc8))
* **agent:** support sequential interrupts across resume ([b22d84e](https://github.com/kortyx-io/kortyx/commit/b22d84e3a805f2bc350b49ad7d9b68c1124439de))

## [0.8.0](https://github.com/kortyx-io/kortyx/compare/example-nextjs-chat-api-route-v0.7.0...example-nextjs-chat-api-route-v0.8.0) (2026-03-11)


### ⚠ BREAKING CHANGES

* remove @kortyx/memory and clarify runtime persistence

### Bug Fixes

* **dx:** simplify streamChat API route surface and docs ([6ac69da](https://github.com/kortyx-io/kortyx/commit/6ac69da30945e48d251b3f16b979177cf5a4d108))
* **dx:** simplify streamChat API route surface and docs ([ec6599a](https://github.com/kortyx-io/kortyx/commit/ec6599a5b745d2ec22d77a0ede4d730ddd4d261a))
* remove @kortyx/memory and clarify runtime persistence ([613574d](https://github.com/kortyx-io/kortyx/commit/613574d535de680a7b9671e801613a8222052dd5))

## [0.7.0](https://github.com/kortyx-io/kortyx/compare/example-nextjs-chat-api-route-v0.6.0...example-nextjs-chat-api-route-v0.7.0) (2026-03-09)


### ⚠ BREAKING CHANGES

* **agent:** simplify createAgent workflow defaults

### Features

* **agent:** simplify createAgent workflow defaults ([d3afbc7](https://github.com/kortyx-io/kortyx/commit/d3afbc77de61ca71c938c78349f383cd346aad99))


### Bug Fixes

* **release:** rollback accidental 1.0 release commit ([16fa5db](https://github.com/kortyx-io/kortyx/commit/16fa5db300c63d4c985a7475ea8375d9b365b925))

## [0.6.0](https://github.com/kortyx-io/kortyx/compare/example-nextjs-chat-api-route-v0.5.0...example-nextjs-chat-api-route-v0.6.0) (2026-03-08)


### Features

* **runtime:** rename graph compiler API and remove LangGraph wording ([43ecfec](https://github.com/kortyx-io/kortyx/commit/43ecfec6f1235fad01344a52c68aeeb1a6636a52))
* **stream:** add consumeStream and improve nextjs chat DX ([6a544cc](https://github.com/kortyx-io/kortyx/commit/6a544cc827aace25b2953a290809eccda37f37f8))


### Bug Fixes

* **examples:** rename api-route example directory ([41f46c3](https://github.com/kortyx-io/kortyx/commit/41f46c3331da4a1d29aba21bf842a52b73801017))

## [0.5.0](https://github.com/kortyx-io/kortyx/compare/example-nextjs-chat-v0.4.1...example-nextjs-chat-v0.5.0) (2026-02-17)


### Features

* **hooks:** consolidate reason+interrupt contracts ([4716a4d](https://github.com/kortyx-io/kortyx/commit/4716a4d4739b4a71b7c6e84717c830cd9ff625a6))


### Bug Fixes

* **hooks:** stabilize useReason interrupt resume and split internals ([fa24712](https://github.com/kortyx-io/kortyx/commit/fa247129f160d129cdf2c05f0a48a2236ea71bb8))

## [0.4.1](https://github.com/kortyx-io/kortyx/compare/example-nextjs-chat-v0.4.0...example-nextjs-chat-v0.4.1) (2026-02-17)


### Bug Fixes

* **meta:** normalize project links in package manifests ([54202eb](https://github.com/kortyx-io/kortyx/commit/54202ebe7fe04505763d7636d20b6c607e7df82d))

## [0.4.0](https://github.com/kortyx-io/kortyx/compare/example-nextjs-chat-v0.3.1...example-nextjs-chat-v0.4.0) (2026-02-17)


### Features

* **example-nextjs-chat:** migrate demo to api route and useReason ([ecd3be3](https://github.com/kortyx-io/kortyx/commit/ecd3be3f2ccb0f19e76234693130d21f5720bb2b))
* **kortyx:** add browser-safe chat streaming adapters ([c7eb98e](https://github.com/kortyx-io/kortyx/commit/c7eb98e06781a708c79f143ba725efb69d35709e))
* make createAgent strict/declarative and split providers ([1d252f2](https://github.com/kortyx-io/kortyx/commit/1d252f2dcd51622f821715c0fffb13733aeb3cae))


### Bug Fixes

* **agent:** remove eager provider registration guard ([8da4059](https://github.com/kortyx-io/kortyx/commit/8da40592d55bb31800a4d85edcd49795ddf09a29))
* **agent:** simplify stream transformer and interrupt orchestration ([d0b5847](https://github.com/kortyx-io/kortyx/commit/d0b58475e139e070fd9ca1a68b71395642ac32d5))
* **example-nextjs-chat:** guard optional sessionId in stream chunks ([664fd60](https://github.com/kortyx-io/kortyx/commit/664fd600556089c4f77c4a92a37f7e69050784ce))

## [0.3.1](https://github.com/kortyx-io/kortyx/compare/example-nextjs-chat-v0.3.0...example-nextjs-chat-v0.3.1) (2026-02-15)


### Bug Fixes

* remove kortyx.config support and update docs ([ecb3f8d](https://github.com/kortyx-io/kortyx/commit/ecb3f8d53a017cc84bf8db3e125a6f711f5d4013))
* remove kortyx.config support and update docs ([aa4a70a](https://github.com/kortyx-io/kortyx/commit/aa4a70a034dfec7bca829793f1729c51be018ae2))

## [0.3.0](https://github.com/kortyx-io/Kortyx/compare/example-nextjs-chat-v0.2.0...example-nextjs-chat-v0.3.0) (2026-02-07)


### Features

* **example-nextjs-chat:** server actions + interrupts ([88ebe58](https://github.com/kortyx-io/Kortyx/commit/88ebe58b91c36c8d83d4ef9162917303cd4391e7))
* **example:** add chat api route ([4d7a4a2](https://github.com/kortyx-io/Kortyx/commit/4d7a4a20a610c6a1d430d300b1a6da0eae21fa34))
* **example:** add kortyx config, client, and workflow integration ([e02121f](https://github.com/kortyx-io/Kortyx/commit/e02121f26882eb3946ca24bdcdbb96e69e5c21ad))


### Bug Fixes

* **deps:** update ai package to address security vulnerabilities ([4acd7c5](https://github.com/kortyx-io/Kortyx/commit/4acd7c5309796291252572a2f89effaf7e9b3454))
* **example:** improve chat input auto-resize with max height ([7ad49a2](https://github.com/kortyx-io/Kortyx/commit/7ad49a2a256be19856579f8045ba9a166a4b76cf))
* remove lint error ([408f17f](https://github.com/kortyx-io/Kortyx/commit/408f17f95a659e52ac216285f3ad9dc4b59132ee))

## [0.2.0](https://github.com/kortyx-io/kortyx/compare/example-nextjs-chat-v0.1.0...example-nextjs-chat-v0.2.0) (2026-01-25)


### Features

* add new example project ([dae4ad0](https://github.com/kortyx-io/kortyx/commit/dae4ad00f2e987ecb71f863bfc776ea7e19e2430))


### Bug Fixes

* align linting method ([99fbbaa](https://github.com/kortyx-io/kortyx/commit/99fbbaa970b301bcb867cc60dac58e46a87f87ab))
