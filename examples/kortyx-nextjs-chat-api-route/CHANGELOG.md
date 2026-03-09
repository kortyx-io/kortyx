# Changelog

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
