# Changelog

## [0.3.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.2.0...studio-v0.3.0) (2026-09-14)


### Features

* **studio:** add manual and scheduled updates through a release CDN ([#181](https://github.com/kortyx-io/kortyx/issues/181)) ([af1fde3](https://github.com/kortyx-io/kortyx/commit/af1fde351642f3bf8e240ff41f5c7f9ad88584de))


### Bug Fixes

* **studio:** make Publish Release (Studio) manual ([e80e097](https://github.com/kortyx-io/kortyx/commit/e80e0974e649dab3ef99ddb55979d11b8ba9ba51))
* **studio:** publish releases through a manual workflow ([e3569e9](https://github.com/kortyx-io/kortyx/commit/e3569e923e591886e6478ba444f7a2cee2df0466))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/telemetry-contracts bumped to 0.6.0

## [0.2.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.1.0...studio-v0.2.0) (2026-09-14)


### ⚠ BREAKING CHANGES

* **errors:** public failure messages and default HTTP statuses change; malformed streams fail explicitly, provider error classes are shared, and retry helpers exclude control flow. Existing calls and legacy records remain supported. See the error-contract migration and release notes.
* **openai:** OpenAI now defaults to Responses. Select api: chat-completions on the provider or model to keep the previous transport. Raw payloads remain transport-specific.

### Features

* add color schema and color options ([3537a51](https://github.com/kortyx-io/kortyx/commit/3537a51c2dba280ac074672b3af63ca79c7ed7cb))
* add resumable child workflows and Studio inspection ([#157](https://github.com/kortyx-io/kortyx/issues/157)) ([542ba29](https://github.com/kortyx-io/kortyx/commit/542ba29b3b57217e6e5d98c1b409bbec5ce3261f))
* cancel workflow trees and reflect cancellation in Studio ([#161](https://github.com/kortyx-io/kortyx/issues/161)) ([699ad18](https://github.com/kortyx-io/kortyx/commit/699ad18905955c6340c3d85b9fae7f0bffd00a0d))
* complete client responses while workflows continue in background ([#165](https://github.com/kortyx-io/kortyx/issues/165)) ([a8a08cd](https://github.com/kortyx-io/kortyx/commit/a8a08cd1e9533e4b44efa4af54a2d2cec54431ae))
* **errors:** harden failure contracts across execution and recovery ([#175](https://github.com/kortyx-io/kortyx/issues/175)) ([d231e36](https://github.com/kortyx-io/kortyx/commit/d231e364259a4f23fc3675d8783fde5ba338416e))
* init shadcn sidebar and shadcn skill ([cb088d8](https://github.com/kortyx-io/kortyx/commit/cb088d857f724823d1ffcca2f73c032a47ab74ca))
* init studio project ([f39737a](https://github.com/kortyx-io/kortyx/commit/f39737ab4d2db713e87cc61dace48b314397a497))
* **interrupts:** add interrupts list page and feature ([fc82386](https://github.com/kortyx-io/kortyx/commit/fc823863cfd6f0feb11b38c619ea2065a4ee1154))
* **openai:** support Responses reasoning tool workflows ([#167](https://github.com/kortyx-io/kortyx/issues/167)) ([b55ba6e](https://github.com/kortyx-io/kortyx/commit/b55ba6e9a16a6f0f39511c4e60961c41f689abd0))
* **ops:** add Studio OSS deployment workflow ([7ae065f](https://github.com/kortyx-io/kortyx/commit/7ae065f4650d4b8acdb0871e1fb25523ce4ce76c))
* **release:** add multi-architecture Studio pipeline ([f2d05b0](https://github.com/kortyx-io/kortyx/commit/f2d05b0550b7132bd51e7b3282a34e01f2b64ec7))
* **runs:** add saved views and expand filter capabilities ([e5d40ef](https://github.com/kortyx-io/kortyx/commit/e5d40ef8970abf3f8f8cc9c45b3ef660231e7ba7))
* **runtime:** add shared execution limits and checkpoint continuation ([#163](https://github.com/kortyx-io/kortyx/issues/163)) ([e22232c](https://github.com/kortyx-io/kortyx/commit/e22232c059fae4f7df1bd36423902bd365887942))
* **sessions:** add sessions list page and feature ([6dc2272](https://github.com/kortyx-io/kortyx/commit/6dc22728c3d5f463f17cb57cd39c197212e40733))
* **studio:** add cross-entity detail drawer stack ([5f02011](https://github.com/kortyx-io/kortyx/commit/5f020114a3a961f4cb571834c91f46d6d38cd289))
* **studio:** add external layout persistence to data-table ([d25056b](https://github.com/kortyx-io/kortyx/commit/d25056b5223057c988b0b450245535e9ad0d8d7c))
* **studio:** add in-route runs filters ([5ba0e04](https://github.com/kortyx-io/kortyx/commit/5ba0e047539e9cedbe82a8fa671bb170b54a4fe3))
* **studio:** add portable self-hosting contract ([82f4851](https://github.com/kortyx-io/kortyx/commit/82f4851d7a945300fb779d08dc6fb75ed3e35c78))
* **studio:** add portable self-hosting deployment ([6775f11](https://github.com/kortyx-io/kortyx/commit/6775f1127cb35de86e17d01ff78d94edf32f9fd2))
* **studio:** add release-ready settings ([1881f6d](https://github.com/kortyx-io/kortyx/commit/1881f6dba4626e4ea9d4d5b59ee86c98d6aa0c11))
* **studio:** add reusable data-table component ([a465de5](https://github.com/kortyx-io/kortyx/commit/a465de50707ab84e9468d27412d1c869752fa3e9))
* **studio:** add runs list and detail pages ([e9d2cf3](https://github.com/kortyx-io/kortyx/commit/e9d2cf3387ad65e878ba37f57638ce87e9a8fed9))
* **studio:** add scalable live refresh ([4506273](https://github.com/kortyx-io/kortyx/commit/4506273e78ded1ebc70c710f30cf1e988714afb1))
* **studio:** add server-backed observability details ([5c9bdef](https://github.com/kortyx-io/kortyx/commit/5c9bdef4485d9c91b1511c77b7846dcb70117acd))
* **studio:** harden self-hosted preview ([c5438f8](https://github.com/kortyx-io/kortyx/commit/c5438f89499f98df7bf6d10cff9e1e37812a1496))
* **studio:** persist runs table preferences via cookie ([947a2b2](https://github.com/kortyx-io/kortyx/commit/947a2b2a2e55f8b9fc0a20a4263ebcb891e95101))
* **studio:** refresh theme tokens and overlay styling ([a98a99d](https://github.com/kortyx-io/kortyx/commit/a98a99de9a06cce0dbcc5714b4a4eff879d66c86))
* **studio:** release self-hosted observability preview ([4e9d3fd](https://github.com/kortyx-io/kortyx/commit/4e9d3fdbc7233f9b1de94ca1afe6dbae9cc9157f))
* **studio:** release self-hosted observability preview ([#139](https://github.com/kortyx-io/kortyx/issues/139)) ([4e9d3fd](https://github.com/kortyx-io/kortyx/commit/4e9d3fdbc7233f9b1de94ca1afe6dbae9cc9157f))
* **studio:** standardize detail formatting ([d3e67d4](https://github.com/kortyx-io/kortyx/commit/d3e67d41626c3e07a38f0098f824cf7e7ae7e796))
* **studio:** unify time range filtering ([fbd9655](https://github.com/kortyx-io/kortyx/commit/fbd965560e8df71cd46f94f814ba33cd41326cff))
* **telemetry:** add shared list UI components and utilities ([dd30aaa](https://github.com/kortyx-io/kortyx/commit/dd30aaa38668aea7aac09811ca399dbceefc2efd))
* **telemetry:** persist Studio read projections ([f66d4f8](https://github.com/kortyx-io/kortyx/commit/f66d4f894361511aca134f672f3d0c63b9eafc95))
* **workflows:** add workflow editor and schemas ([41f047c](https://github.com/kortyx-io/kortyx/commit/41f047c264162e4c1830741fe9696c430fbceddb))


### Bug Fixes

* harden interrupt lifecycle semantics ([958d149](https://github.com/kortyx-io/kortyx/commit/958d149596d54215821ef5a7f8562a06a7459149))
* **layout:** use next/script for theme initialization ([4460610](https://github.com/kortyx-io/kortyx/commit/446061072249da4e124a9e03fa55e430a634041d))
* **studio:** animate drawers across history navigation ([97c283a](https://github.com/kortyx-io/kortyx/commit/97c283ab81bb7a04eea6573b02fc2ddd591f0428))
* **studio:** improve canvas layout and responsive loading states ([#176](https://github.com/kortyx-io/kortyx/issues/176)) ([dbba1f4](https://github.com/kortyx-io/kortyx/commit/dbba1f4ee02ae60ffeb2e8261a83ab2fb5065076))
* **studio:** isolate expanded drawer presentation ([f1bb216](https://github.com/kortyx-io/kortyx/commit/f1bb2164aad1d72b1efbc67fc7a6502d24188409))
* **studio:** manage versions with release-please ([#177](https://github.com/kortyx-io/kortyx/issues/177)) ([b1d3613](https://github.com/kortyx-io/kortyx/commit/b1d36131a18efdd415ff128269c359cc8f6cb74b))
* **studio:** persist drawers through route exits ([50eed2a](https://github.com/kortyx-io/kortyx/commit/50eed2a25143281f6d54f9377f1e5f97d0e48d60))
* **studio:** polish runs toolbar selects and columns menu ([a758ae4](https://github.com/kortyx-io/kortyx/commit/a758ae41168479893734319d30837542763bb17e))
* **studio:** preserve drawer during loading swap ([2edb330](https://github.com/kortyx-io/kortyx/commit/2edb33022cf1ed402ca049dbcb12de0398b20458))
* **studio:** reconcile incomplete run lifecycles ([2a3d9f4](https://github.com/kortyx-io/kortyx/commit/2a3d9f4cc927cccfd6efc6256a848b704a0d203f))
* **studio:** redirect home to runs ([#178](https://github.com/kortyx-io/kortyx/issues/178)) ([461d519](https://github.com/kortyx-io/kortyx/commit/461d519845944a0ecbb28623886359980f5952ff))
* **studio:** refine stacked drawer interactions ([b2b5c32](https://github.com/kortyx-io/kortyx/commit/b2b5c328eaaf9c62e07ca7df6f6a823e529ecabe))
* **studio:** release backdrop for expanded details ([54463cc](https://github.com/kortyx-io/kortyx/commit/54463ccdd7c8ad8c769e90ceb1621869efcbc8c6))
* **studio:** restore payload viewer controls ([9b29d61](https://github.com/kortyx-io/kortyx/commit/9b29d6199285831d740555c51424c3d9a0708809))
* **studio:** stabilize drawer history transitions ([600be4e](https://github.com/kortyx-io/kortyx/commit/600be4ebe263f1c61a3a0f4dc3801a8af8d90eae))
* **studio:** stabilize nested drawer backdrop ([2f31562](https://github.com/kortyx-io/kortyx/commit/2f31562d811dc14446cbdbd9bc142473628f7a78))
