# Changelog

## [0.26.2](https://github.com/kortyx-io/kortyx/compare/studio-v0.26.1...studio-v0.26.2) (2026-10-26)


### Bug Fixes

* **studio:** default to rolling upgrades and preserve judge compatibility ([#404](https://github.com/kortyx-io/kortyx/issues/404)) ([4e0b691](https://github.com/kortyx-io/kortyx/commit/4e0b69132abec0aaebafb65e44db836981b325e8))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/prompts bumped to 0.3.2
    * @kortyx/telemetry-contracts bumped to 0.20.4
    * @kortyx/usage-telemetry bumped to 0.6.2
  * devDependencies
    * @kortyx/agent bumped to 0.44.0
    * @kortyx/telemetry bumped to 0.17.8
    * kortyx bumped to 0.35.0

## [0.26.1](https://github.com/kortyx-io/kortyx/compare/studio-v0.26.0...studio-v0.26.1) (2026-10-25)


### Bug Fixes

* **studio:** limit Runs truncation to status labels ([18b3535](https://github.com/kortyx-io/kortyx/commit/18b3535a9c2a51f0fe7eaaeda3cb6af548f6708c))
* **studio:** preserve missing-route fallback across parallel slots ([#399](https://github.com/kortyx-io/kortyx/issues/399)) ([b2c2bbd](https://github.com/kortyx-io/kortyx/commit/b2c2bbd5f85b1f7b5c56bdc329e9a9e1b0a1b633))
* **studio:** preserve table controls and plain-cell hover help ([623c770](https://github.com/kortyx-io/kortyx/commit/623c770ed7f8e11ba26f406a26256b0812f4a006))
* **studio:** refine table statuses, help, and responsive layouts ([473ad5b](https://github.com/kortyx-io/kortyx/commit/473ad5b74610763fd37d5657279211b71e4573c8))
* **studio:** refine table statuses, help, and responsive layouts ([0e01580](https://github.com/kortyx-io/kortyx/commit/0e01580124fb35ca2627ee42c3642e515f463cb5))
* **studio:** support strict evaluation adapter imports ([#396](https://github.com/kortyx-io/kortyx/issues/396)) ([453ef55](https://github.com/kortyx-io/kortyx/commit/453ef55a5bdf8f3c99fb05663f784341d32fa565))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/telemetry-contracts bumped to 0.20.3
  * devDependencies
    * @kortyx/agent bumped to 0.43.1
    * @kortyx/telemetry bumped to 0.17.7
    * kortyx bumped to 0.34.2

## [0.26.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.25.0...studio-v0.26.0) (2026-10-24)


### Features

* **evals:** configure grading deadlines with inherited defaults ([2c5d8d3](https://github.com/kortyx-io/kortyx/commit/2c5d8d3be9016d19da248712e9d2e887366ca0c6))


### Bug Fixes

* **deps:** require patched Zod collection validation ([db46288](https://github.com/kortyx-io/kortyx/commit/db46288644043230c65972b35e32f762a8f19f5c))
* recover invalid reason output and bound evaluation inspection ([56528ab](https://github.com/kortyx-io/kortyx/commit/56528ab6a3c33dd64c594e4a0579cd85d31a0e47))
* **studio:** align retained drawer snapshots with committed navigation ([a72497b](https://github.com/kortyx-io/kortyx/commit/a72497b148fa7cc05533c92a1a613ccc0dea1535))
* **studio:** align suite progress and coordinate tooltip dismissal ([e048b41](https://github.com/kortyx-io/kortyx/commit/e048b41ad684514013d50850162416cd5c96c469))
* **studio:** animate history-restored drawer exits ([0f241f5](https://github.com/kortyx-io/kortyx/commit/0f241f598bf68ead08f7e12e9765365d091ab234))
* **studio:** close restored drawers using the committed browser URL ([34022de](https://github.com/kortyx-io/kortyx/commit/34022def1b1483d5273a3a4cf9e8424a8b0b6f49))
* **studio:** close retained drawers on category list navigation ([178a107](https://github.com/kortyx-io/kortyx/commit/178a107e6cba92991174ac93441e6f8f4b90be19))
* **studio:** expose suite titles and wrap evaluation metrics ([3d47090](https://github.com/kortyx-io/kortyx/commit/3d47090fac47e59e732e5ae931189b745df2ffa0))
* **studio:** fence late drawer registration after history restoration ([337e5c4](https://github.com/kortyx-io/kortyx/commit/337e5c4d699a73ea15691e30f98c3780a024f87b))
* **studio:** give suite bars a shared neutral outline ([08d077e](https://github.com/kortyx-io/kortyx/commit/08d077e7992a44ee7604bde9a47a16c5f2215b38))
* **studio:** keep evaluation page help within its reading limit ([4a60ab2](https://github.com/kortyx-io/kortyx/commit/4a60ab24f83deab70cd3b893481b8cd429e5bf5c))
* **studio:** narrow optional prompt comparison in tour steps ([af808ae](https://github.com/kortyx-io/kortyx/commit/af808ae19599d76c9ddbc5f05c4c86afbc504dd3))
* **studio:** overlay header help controls and unify status bar rendering ([df6fb65](https://github.com/kortyx-io/kortyx/commit/df6fb6540c945c2f78ae5516e115aeb9f4114229))
* **studio:** preserve retained payload route identity ([93882c8](https://github.com/kortyx-io/kortyx/commit/93882c8f8773efb25cae68bf400e091f11647a29))
* **studio:** preserve text helper imports and prompt cache expectations ([5eda5d6](https://github.com/kortyx-io/kortyx/commit/5eda5d6eba91b080796764cd50b5c95b5954e2f7))
* **studio:** read committed query state on history traversal ([48073a6](https://github.com/kortyx-io/kortyx/commit/48073a6bcd02032a665f04fe67c0bcf38b3f023e))
* **studio:** recover judge instructions from recorded grading requests ([24d0dfc](https://github.com/kortyx-io/kortyx/commit/24d0dfc8f3ff0e8400e790187fcfa23eb67bbdf5))
* **studio:** refine eval controls, tables and grading timeouts ([646718b](https://github.com/kortyx-io/kortyx/commit/646718b95f0372a3f96d88a65fe1a4a709a31c34))
* **studio:** refine evaluation controls and table presentation ([1397c06](https://github.com/kortyx-io/kortyx/commit/1397c064035c2291c300acafd221dc5cc36dbf11))
* **studio:** refresh query snapshot after route commits ([ba8c776](https://github.com/kortyx-io/kortyx/commit/ba8c776e80c283ba3f37b5b453ef2168c683a2c6))
* **studio:** reject late removed drawers after history restore ([b26b856](https://github.com/kortyx-io/kortyx/commit/b26b85655238841605323eef5b6fc009ea5da67b))
* **studio:** release closed drawers retained by route caches ([9c66573](https://github.com/kortyx-io/kortyx/commit/9c66573e00a5109fef72f94a98842f51a10a40b9))
* **studio:** release retained drawers on standalone detail navigation ([d62f55c](https://github.com/kortyx-io/kortyx/commit/d62f55c182bfc73f5bac84bc23329697cdea75cb))
* **studio:** retain ancestors by their parallel route slot ([a1fa010](https://github.com/kortyx-io/kortyx/commit/a1fa0100c75147f7618a46572538e44852acce37))
* **studio:** retain drawer payloads for browser history restoration ([f72a230](https://github.com/kortyx-io/kortyx/commit/f72a2304b12804ed26099bdf276af45f4052e6ef))
* **studio:** scope expanded detail query to its owning drawer ([3bd9ebf](https://github.com/kortyx-io/kortyx/commit/3bd9ebf2744edfd202e039ead118221c1d7f7642))
* **studio:** separate status colors instead of outlining the bar ([29f291f](https://github.com/kortyx-io/kortyx/commit/29f291f004a9508e859571e2a35dc2cbf3749af9))
* **studio:** share live query state with retained drawers ([369020d](https://github.com/kortyx-io/kortyx/commit/369020d9f71a1cdb184d5747086aaae9e5f8d24b))
* **studio:** stabilize hydrated timing and stacked inspector interaction ([e5baa79](https://github.com/kortyx-io/kortyx/commit/e5baa7911428480ec4e75cc70f914a1f95193787))
* **studio:** synchronize prompt tour navigation through query state ([17eaaf4](https://github.com/kortyx-io/kortyx/commit/17eaaf46971e26093fdb3ddb49dbc510db4883fc))
* **studio:** update nuqs to preserve query state through navigation ([8b85b62](https://github.com/kortyx-io/kortyx/commit/8b85b6229a295fd0961764f98860c0f5cc653356))
* **studio:** use live destination for drawer host visibility ([c5976ad](https://github.com/kortyx-io/kortyx/commit/c5976adee795e28e7b5c909abea06c61fdd2b5c6))
* **studio:** use supported custom query adapter factory ([b8a586c](https://github.com/kortyx-io/kortyx/commit/b8a586c5ac5ee747497e0191994241b14c060ea7))
* **studio:** verify route commit before notifying query readers ([de4b81b](https://github.com/kortyx-io/kortyx/commit/de4b81b301d048fc81cee9542d333a2c53a32853))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/prompts bumped to 0.3.1
    * @kortyx/telemetry-contracts bumped to 0.20.2
    * @kortyx/usage-telemetry bumped to 0.6.1
  * devDependencies
    * @kortyx/agent bumped to 0.43.0
    * @kortyx/telemetry bumped to 0.17.6
    * kortyx bumped to 0.34.1

## [0.25.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.24.1...studio-v0.25.0) (2026-10-22)


### Features

* **evals:** add portable judge prompts and suite-owned judges ([9a11389](https://github.com/kortyx-io/kortyx/commit/9a11389203ac08ba9dbf1700e9838ad1b5b59d1c))
* **evals:** add portable judge prompts and suite-owned judges ([18092cf](https://github.com/kortyx-io/kortyx/commit/18092cf0840933beeda98b6e3d17f774f2f4678d))


### Bug Fixes

* **release:** replace unpublished eval release candidate ([#391](https://github.com/kortyx-io/kortyx/issues/391)) ([7d9898c](https://github.com/kortyx-io/kortyx/commit/7d9898cec73a6eaf1daf3504bc17520437a293d1))
* **studio:** align judge prompt drawer with prompt messages ([d3e5544](https://github.com/kortyx-io/kortyx/commit/d3e554494d4b2e0c754e27e4990333e27c385a56))
* **studio:** clarify eval assessments and polish result controls ([2091401](https://github.com/kortyx-io/kortyx/commit/2091401f5c05bd6dac3d2f7e9077dd72c04f5cee))
* **studio:** clarify eval evidence and polish result controls ([f6e7f9e](https://github.com/kortyx-io/kortyx/commit/f6e7f9ef8e4e0d16918d371a8ae64af0c1dbcd43))
* **studio:** use shared slim scrollbar for metric strips ([ce74559](https://github.com/kortyx-io/kortyx/commit/ce745592bf89ed1e9bebedeb1c22da1ea71023b5))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/prompts bumped to 0.3.0
    * @kortyx/telemetry-contracts bumped to 0.20.1
  * devDependencies
    * @kortyx/agent bumped to 0.42.0
    * @kortyx/telemetry bumped to 0.17.5
    * kortyx bumped to 0.34.0

## [0.24.1](https://github.com/kortyx-io/kortyx/compare/studio-v0.24.0...studio-v0.24.1) (2026-10-21)


### Bug Fixes

* **studio:** bound comparison memory and load summaries asynchronously ([221087a](https://github.com/kortyx-io/kortyx/commit/221087ac4340ea078b8c9145a6bb1a51f9dab7c0))
* **studio:** bound evaluation comparison memory ([8403bd2](https://github.com/kortyx-io/kortyx/commit/8403bd2e910d115c9d0393f2fb28dcf3e1bb972d))
* **studio:** cache bounded completed change summaries ([a593dba](https://github.com/kortyx-io/kortyx/commit/a593dbaf8e4ffc27e21876a5314adfdf43e5a9db))
* **studio:** preserve sample isolation with cached comparisons ([e5291c0](https://github.com/kortyx-io/kortyx/commit/e5291c07414532738a403019685f5a1998345c93))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kortyx/agent bumped to 0.41.1
    * kortyx bumped to 0.33.1

## [0.24.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.23.3...studio-v0.24.0) (2026-10-21)


### Features

* **evals:** add deterministic checks and failed-case reruns ([8b63a21](https://github.com/kortyx-io/kortyx/commit/8b63a214b59a55c36df3facd6b85f38def62f568))
* **studio:** improve eval navigation, comparisons and inspection ([4d18eed](https://github.com/kortyx-io/kortyx/commit/4d18eed1db566e808e220215008951a46ef6113c))
* **studio:** unify eval browsing and conversation comparisons ([7f6d26e](https://github.com/kortyx-io/kortyx/commit/7f6d26ef60474c113c84d3549fe13acd27731d8d))


### Bug Fixes

* **studio:** keep loading search inert and align eval regressions ([d22b8fa](https://github.com/kortyx-io/kortyx/commit/d22b8fae37f3fa2b41308ea589afeb9d87199e0e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/prompts bumped to 0.2.4
    * @kortyx/telemetry-contracts bumped to 0.20.0
    * @kortyx/usage-telemetry bumped to 0.6.0
  * devDependencies
    * @kortyx/agent bumped to 0.41.0
    * @kortyx/telemetry bumped to 0.17.4
    * kortyx bumped to 0.33.0

## [0.23.3](https://github.com/kortyx-io/kortyx/compare/studio-v0.23.2...studio-v0.23.3) (2026-10-20)


### Bug Fixes

* **evals:** keep live updates off full-result reads ([301d690](https://github.com/kortyx-io/kortyx/commit/301d69087167ce6086c45ec4c7efe4679bb5604b))
* **evals:** keep live updates off full-result reads ([76f846b](https://github.com/kortyx-io/kortyx/commit/76f846bdc86c1f9b3e4ff1ff593f86c8e3f7ba98))
* **evals:** preserve navigation state and align CI regressions ([2c95706](https://github.com/kortyx-io/kortyx/commit/2c957069ab3747b924806c52b8b091d3a001f02c))
* **studio:** redirect expired account sessions automatically ([9710292](https://github.com/kortyx-io/kortyx/commit/97102925fa74aacd90f259811d87b0e627c17995))
* **studio:** redirect expired account sessions automatically ([d472e5b](https://github.com/kortyx-io/kortyx/commit/d472e5b5e315a195eb3085567da5a669467ae77a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kortyx/agent bumped to 0.40.2
    * @kortyx/telemetry bumped to 0.17.3
    * kortyx bumped to 0.32.3

## [0.23.2](https://github.com/kortyx-io/kortyx/compare/studio-v0.23.1...studio-v0.23.2) (2026-10-18)


### Bug Fixes

* **studio:** explain prompt save failures and recovery ([d84ab76](https://github.com/kortyx-io/kortyx/commit/d84ab76dc1d1090046c4d25f4c324b444e92801f))
* **studio:** explain prompt save failures and recovery ([b0a1cf4](https://github.com/kortyx-io/kortyx/commit/b0a1cf4ab2c56bd8684bf5506f03b04b6746a95a))

## [0.23.1](https://github.com/kortyx-io/kortyx/compare/studio-v0.23.0...studio-v0.23.1) (2026-10-18)


### Bug Fixes

* **studio:** correct page help and failed-run Trace guidance ([aae818d](https://github.com/kortyx-io/kortyx/commit/aae818d61229b981aa34a423dab54c030c0ad885))
* **studio:** guide failed Trace through its selected inspector ([37b891b](https://github.com/kortyx-io/kortyx/commit/37b891b3ed615597adf004f5c45bcc74fd63e487))
* **studio:** keep sample evaluations compatible with strict consumers ([#370](https://github.com/kortyx-io/kortyx/issues/370)) ([df65a87](https://github.com/kortyx-io/kortyx/commit/df65a87473f62175d64b4011015240bdba3dc62f))
* **studio:** preserve chapter resume across sample entry ([a327135](https://github.com/kortyx-io/kortyx/commit/a327135c8317b72ed989fb39b66c031f029e3c8e))
* **studio:** resume saved chapters from real projects ([76b1c8f](https://github.com/kortyx-io/kortyx/commit/76b1c8f947d935d5f443cc29bda4db2e38e42967))
* **studio:** use authored settings help for page explanations ([70865d8](https://github.com/kortyx-io/kortyx/commit/70865d896fcc32e9903f1fa0a6ae30373cfefc5c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/telemetry-contracts bumped to 0.19.1
  * devDependencies
    * @kortyx/agent bumped to 0.40.1
    * @kortyx/telemetry bumped to 0.17.2
    * kortyx bumped to 0.32.2

## [0.23.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.22.0...studio-v0.23.0) (2026-10-18)


### Features

* **cli:** validate topology and update compatible dependencies ([6c16ef3](https://github.com/kortyx-io/kortyx/commit/6c16ef3d1c9e8329d31f1a28e87aa26ae6dbe651))
* **studio:** add contextual help and organize product documentation ([#366](https://github.com/kortyx-io/kortyx/issues/366)) ([aa4a624](https://github.com/kortyx-io/kortyx/commit/aa4a6242f6294e0f96968a8021440cdc55467121))
* **studio:** add sample project and guided onboarding ([#363](https://github.com/kortyx-io/kortyx/issues/363)) ([25da0b9](https://github.com/kortyx-io/kortyx/commit/25da0b9c92072446a7503b23ba4f157aebec8185))
* **studio:** drain evaluation workers and consumer endpoints safely ([#365](https://github.com/kortyx-io/kortyx/issues/365)) ([0bcd853](https://github.com/kortyx-io/kortyx/commit/0bcd85310f5ccf59772b2fa9ed4dd28d03394546))
* **studio:** persist table preferences with scoped browser caches ([#367](https://github.com/kortyx-io/kortyx/issues/367)) ([9b84295](https://github.com/kortyx-io/kortyx/commit/9b8429563d0a065939381de5afe1c62e762157d0))


### Bug Fixes

* **studio:** omit unset usage context fields for strict adapters ([#361](https://github.com/kortyx-io/kortyx/issues/361)) ([a91327c](https://github.com/kortyx-io/kortyx/commit/a91327c8a5ae58686a0ed6c39b3930855483e140))


### Reverts

* **studio:** remove unneeded presentation capture ([#368](https://github.com/kortyx-io/kortyx/issues/368)) ([b25645a](https://github.com/kortyx-io/kortyx/commit/b25645a77263e2647bfe12edd01504faad20df01))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/prompts bumped to 0.2.3
    * @kortyx/telemetry-contracts bumped to 0.19.0
    * @kortyx/usage-telemetry bumped to 0.5.0
  * devDependencies
    * @kortyx/agent bumped to 0.40.0
    * @kortyx/telemetry bumped to 0.17.1
    * kortyx bumped to 0.32.1

## [0.22.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.21.1...studio-v0.22.0) (2026-10-16)


### Features

* **evals:** configurable deadlines and original error visibility ([#354](https://github.com/kortyx-io/kortyx/issues/354)) ([7dde173](https://github.com/kortyx-io/kortyx/commit/7dde173b54eb37a2d28ff28ac342a3333e5ed902))
* **studio:** standardize tables, filters and column behavior ([#353](https://github.com/kortyx-io/kortyx/issues/353)) ([c662e59](https://github.com/kortyx-io/kortyx/commit/c662e59d814a6a9f12c709595968ee7b1ece3191))
* **telemetry:** improve failure classification and add CLI usage ([#355](https://github.com/kortyx-io/kortyx/issues/355)) ([c5fbbed](https://github.com/kortyx-io/kortyx/commit/c5fbbed3064ea7b2b3020617db7ce09d1b175db3))


### Bug Fixes

* **studio:** restore navigation progress and prevent stale URL updates ([#351](https://github.com/kortyx-io/kortyx/issues/351)) ([1a60047](https://github.com/kortyx-io/kortyx/commit/1a60047e98ec76f7add56847c207225c04a133f7))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/prompts bumped to 0.2.2
    * @kortyx/telemetry-contracts bumped to 0.18.0
    * @kortyx/usage-telemetry bumped to 0.4.0
  * devDependencies
    * @kortyx/agent bumped to 0.39.0
    * @kortyx/telemetry bumped to 0.17.0
    * kortyx bumped to 0.32.0

## [0.21.1](https://github.com/kortyx-io/kortyx/compare/studio-v0.21.0...studio-v0.21.1) (2026-10-14)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kortyx/agent bumped to 0.38.1
    * @kortyx/telemetry bumped to 0.16.1
    * kortyx bumped to 0.31.1

## [0.21.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.20.1...studio-v0.21.0) (2026-10-13)


### ⚠ BREAKING CHANGES

* **agent:** Consumer eval routes cap active attempts at 20 by default. Set maxActiveAttempts before upgrading consumers with higher concurrency. Upgrade API and Studio together for the new case-dispatch progress events.

### Features

* **agent:** make concurrent eval execution resilient ([#339](https://github.com/kortyx-io/kortyx/issues/339)) ([84d0e4f](https://github.com/kortyx-io/kortyx/commit/84d0e4fe3d35e5cf80713f7550ef2b1d83e5a2ec))
* **studio:** enable OSS capabilities by default ([#336](https://github.com/kortyx-io/kortyx/issues/336)) ([7e55ba5](https://github.com/kortyx-io/kortyx/commit/7e55ba55c5a5a488b4284ae79b57b23ca6b6b494))


### Bug Fixes

* **evals:** preserve diagnostics and separate postcondition failures ([#337](https://github.com/kortyx-io/kortyx/issues/337)) ([d4fce4e](https://github.com/kortyx-io/kortyx/commit/d4fce4e670971d3b755835fc681c8125f67a9c70))
* **release:** surface blocked releases and resume the queue ([#341](https://github.com/kortyx-io/kortyx/issues/341)) ([24738b9](https://github.com/kortyx-io/kortyx/commit/24738b91ea41985ed88d3a73b3e892bc6bf6db94))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/prompts bumped to 0.2.1
    * @kortyx/telemetry-contracts bumped to 0.17.2
    * @kortyx/usage-telemetry bumped to 0.3.0
  * devDependencies
    * @kortyx/agent bumped to 0.38.0
    * @kortyx/telemetry bumped to 0.16.0
    * kortyx bumped to 0.31.0

## [0.20.1](https://github.com/kortyx-io/kortyx/compare/studio-v0.20.0...studio-v0.20.1) (2026-10-13)


### Bug Fixes

* **studio:** show available model cost subtotals everywhere ([#335](https://github.com/kortyx-io/kortyx/issues/335)) ([d19cf5d](https://github.com/kortyx-io/kortyx/commit/d19cf5d7716a7649c738373ba2cea1ef64d532e0))
* **telemetry:** classify scoped Studio navigation ([#329](https://github.com/kortyx-io/kortyx/issues/329)) ([f9952fe](https://github.com/kortyx-io/kortyx/commit/f9952feb7425b1896623a6c6c06bfda8ed0dd739))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/telemetry-contracts bumped to 0.17.1
  * devDependencies
    * @kortyx/agent bumped to 0.37.1
    * @kortyx/telemetry bumped to 0.15.1
    * kortyx bumped to 0.30.2

## [0.20.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.19.0...studio-v0.20.0) (2026-10-11)


### Features

* add shared SDK and Studio usage telemetry ([#313](https://github.com/kortyx-io/kortyx/issues/313)) ([7d5f0c0](https://github.com/kortyx-io/kortyx/commit/7d5f0c005bd7721dc6a529554e75c14573d76a0f))
* **studio:** support onboarding within the shared shell ([#307](https://github.com/kortyx-io/kortyx/issues/307)) ([0537791](https://github.com/kortyx-io/kortyx/commit/053779143946bbffc50205dee3e3ea57acc29d2a))


### Bug Fixes

* **prompts:** make promotion requirements opt-in ([#312](https://github.com/kortyx-io/kortyx/issues/312)) ([9f6f696](https://github.com/kortyx-io/kortyx/commit/9f6f696152d24f722ed36ef22331a6061e36cff2))
* **studio:** improve prompt loading and eval empty states ([#310](https://github.com/kortyx-io/kortyx/issues/310)) ([5bc4d95](https://github.com/kortyx-io/kortyx/commit/5bc4d952419be949760798d814bc82f4fc2a2ac5))
* **studio:** label organization Projects breadcrumbs ([#311](https://github.com/kortyx-io/kortyx/issues/311)) ([2970550](https://github.com/kortyx-io/kortyx/commit/297055097c09126f63f07ea0fbe384a494c3ebe0))
* **studio:** repair prompt navigation and mutation cache freshness ([4f5b40d](https://github.com/kortyx-io/kortyx/commit/4f5b40dcce9e174694e05ee6507cd3c457bba78d))
* **studio:** repair prompt navigation, list freshness and key validation ([f0354aa](https://github.com/kortyx-io/kortyx/commit/f0354aa4127ede62b22a5235fe01857e6fe3f9f7))
* **website:** reconcile credibility branch with current main ([60199f9](https://github.com/kortyx-io/kortyx/commit/60199f992242eb7c409a95bc7a6898d31bac601d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/prompts bumped to 0.2.0
    * @kortyx/telemetry-contracts bumped to 0.17.0
    * @kortyx/usage-telemetry bumped to 0.2.0
  * devDependencies
    * @kortyx/agent bumped to 0.37.0
    * @kortyx/telemetry bumped to 0.15.0
    * kortyx bumped to 0.30.1

## [0.19.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.18.0...studio-v0.19.0) (2026-10-10)


### Features

* version, evaluate, serve and migrate Studio prompts ([#288](https://github.com/kortyx-io/kortyx/issues/288)) ([0802f8b](https://github.com/kortyx-io/kortyx/commit/0802f8b91c4a541d176dd8a75c659063e2c28c8c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/prompts bumped to 0.1.0
    * @kortyx/telemetry-contracts bumped to 0.16.0
  * devDependencies
    * @kortyx/agent bumped to 0.36.0
    * @kortyx/telemetry bumped to 0.14.0
    * kortyx bumped to 0.30.0

## [0.18.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.17.0...studio-v0.18.0) (2026-10-09)


### Features

* **evals:** share concurrency and attribute multi-session costs ([#304](https://github.com/kortyx-io/kortyx/issues/304)) ([dd5e242](https://github.com/kortyx-io/kortyx/commit/dd5e242ae08affbb015201bb57c4714709756cf2))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kortyx/agent bumped to 0.35.0
    * @kortyx/telemetry bumped to 0.13.0
    * kortyx bumped to 0.29.3

## [0.17.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.16.1...studio-v0.17.0) (2026-10-09)


### Features

* **evals:** raise concurrency limit to 20 ([#300](https://github.com/kortyx-io/kortyx/issues/300)) ([0ed3151](https://github.com/kortyx-io/kortyx/commit/0ed3151e2984551d84113091594a0b8f9267289a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kortyx/agent bumped to 0.34.0
    * kortyx bumped to 0.29.2

## [0.16.1](https://github.com/kortyx-io/kortyx/compare/studio-v0.16.0...studio-v0.16.1) (2026-10-08)


### Bug Fixes

* **ui:** preserve multiline prompt formatting ([#296](https://github.com/kortyx-io/kortyx/issues/296)) ([9f4af86](https://github.com/kortyx-io/kortyx/commit/9f4af8676c10a19f5dc5661fed00d3130276284c))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kortyx/agent bumped to 0.33.0
    * @kortyx/telemetry bumped to 0.12.1
    * kortyx bumped to 0.29.1

## [0.16.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.15.0...studio-v0.16.0) (2026-10-08)


### Features

* **evals:** compact judge evidence and add suite selection ([#293](https://github.com/kortyx-io/kortyx/issues/293)) ([9754f7c](https://github.com/kortyx-io/kortyx/commit/9754f7cacc61b5945a254ccaa66e17b1b5c8d13f))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kortyx/agent bumped to 0.32.0
    * kortyx bumped to 0.29.0

## [0.15.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.14.0...studio-v0.15.0) (2026-10-08)


### Features

* **telemetry:** preserve complete private error diagnostics ([#290](https://github.com/kortyx-io/kortyx/issues/290)) ([e1c5a88](https://github.com/kortyx-io/kortyx/commit/e1c5a88c494016fd84a1af40579412fcfde31271))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/telemetry-contracts bumped to 0.15.0
  * devDependencies
    * @kortyx/agent bumped to 0.31.1
    * @kortyx/telemetry bumped to 0.12.0
    * kortyx bumped to 0.28.2

## [0.14.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.13.0...studio-v0.14.0) (2026-10-07)


### Features

* **evals:** group suite runs and expose CLI results ([#284](https://github.com/kortyx-io/kortyx/issues/284)) ([146fd71](https://github.com/kortyx-io/kortyx/commit/146fd71a88587e5591dd0511a4c0cb57969f9d07))
* **studio:** add route progress indicator ([#285](https://github.com/kortyx-io/kortyx/issues/285)) ([1142f3d](https://github.com/kortyx-io/kortyx/commit/1142f3d451dd5f819c6c1017449fb5330be878be))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kortyx/agent bumped to 0.31.0
    * kortyx bumped to 0.28.1

## [0.13.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.12.0...studio-v0.13.0) (2026-10-07)


### Features

* **api:** add typed security and tenant database extensions ([#260](https://github.com/kortyx-io/kortyx/issues/260)) ([47e4928](https://github.com/kortyx-io/kortyx/commit/47e49286f12e4470b3a327e609a65c99678b359f))
* **studio:** add typed auth adapter and native build profiles ([#257](https://github.com/kortyx-io/kortyx/issues/257)) ([817c137](https://github.com/kortyx-io/kortyx/commit/817c137f955d1f17101c49386b9ba156f9157294))
* **studio:** add typed contributions to existing Settings ([#277](https://github.com/kortyx-io/kortyx/issues/277)) ([152ddbf](https://github.com/kortyx-io/kortyx/commit/152ddbf623bc911348dd97f588132285667f3dab))
* **studio:** guide first-time setup inside Settings ([#279](https://github.com/kortyx-io/kortyx/issues/279)) ([85bdb52](https://github.com/kortyx-io/kortyx/commit/85bdb5224071ebc81bf12acff99ae19322f329b3))
* **studio:** unify extensible workspace shell and scoped settings ([#280](https://github.com/kortyx-io/kortyx/issues/280)) ([cf51257](https://github.com/kortyx-io/kortyx/commit/cf5125765317f67aa27e1dd2f8130315e9632390))


### Bug Fixes

* **security:** remediate CodeQL findings ([#273](https://github.com/kortyx-io/kortyx/issues/273)) ([55bc484](https://github.com/kortyx-io/kortyx/commit/55bc48426b72c0d370fe830f64db5bc1249bb861))
* **security:** remediate production dependency risks ([#267](https://github.com/kortyx-io/kortyx/issues/267)) ([319daa1](https://github.com/kortyx-io/kortyx/commit/319daa1716a8684c332842bc6b6e9bb9474219e7))
* **studio:** stabilize feedback badge hydration ([#261](https://github.com/kortyx-io/kortyx/issues/261)) ([50461c2](https://github.com/kortyx-io/kortyx/commit/50461c29656e1b3eecfe40b96479b072eca97d85))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/telemetry-contracts bumped to 0.14.0
  * devDependencies
    * @kortyx/agent bumped to 0.30.0
    * @kortyx/telemetry bumped to 0.11.2
    * kortyx bumped to 0.28.0

## [0.12.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.11.0...studio-v0.12.0) (2026-10-03)


### Features

* **evals:** run conversation suites from Studio and CLI ([#251](https://github.com/kortyx-io/kortyx/issues/251)) ([e653c91](https://github.com/kortyx-io/kortyx/commit/e653c9188d2fad4da0c75e79d090a8dedb639b92))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/telemetry-contracts bumped to 0.13.0
  * devDependencies
    * @kortyx/agent bumped to 0.29.0
    * @kortyx/telemetry bumped to 0.11.1
    * kortyx bumped to 0.27.0

## [0.11.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.10.1...studio-v0.11.0) (2026-09-30)


### Features

* **hooks:** add realtime model-selected output contracts ([#249](https://github.com/kortyx-io/kortyx/issues/249)) ([ac52b47](https://github.com/kortyx-io/kortyx/commit/ac52b47151b64ce5be6ce6c7fd42d34a0fa8a76d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/telemetry-contracts bumped to 0.12.0
  * devDependencies
    * @kortyx/agent bumped to 0.28.0
    * @kortyx/telemetry bumped to 0.11.0
    * kortyx bumped to 0.26.0

## [0.10.1](https://github.com/kortyx-io/kortyx/compare/studio-v0.10.0...studio-v0.10.1) (2026-09-29)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kortyx/telemetry bumped to 0.10.1

## [0.10.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.9.3...studio-v0.10.0) (2026-09-25)


### Features

* **studio:** improve run inspection and telemetry resilience ([#244](https://github.com/kortyx-io/kortyx/issues/244)) ([f03dfdc](https://github.com/kortyx-io/kortyx/commit/f03dfdcb32dee26023c0f4ea1af8708da623673a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kortyx/telemetry bumped to 0.10.0

## [0.9.3](https://github.com/kortyx-io/kortyx/compare/studio-v0.9.2...studio-v0.9.3) (2026-09-23)


### Bug Fixes

* **studio:** include root TypeScript configs in release images ([#236](https://github.com/kortyx-io/kortyx/issues/236)) ([10b78c9](https://github.com/kortyx-io/kortyx/commit/10b78c92ab602d2820e5cfa55de83d1713d85dff))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kortyx/agent bumped to 0.27.0
    * kortyx bumped to 0.25.0

## [0.9.2](https://github.com/kortyx-io/kortyx/compare/studio-v0.9.1...studio-v0.9.2) (2026-09-22)


### Bug Fixes

* **ci:** automate release delivery and shard Studio tests ([#231](https://github.com/kortyx-io/kortyx/issues/231)) ([5844120](https://github.com/kortyx-io/kortyx/commit/584412043a99b93dfcc3f2bf004df1bb95090b37))
* **studio:** ignore exiting drawers during ancestor navigation ([#234](https://github.com/kortyx-io/kortyx/issues/234)) ([89c6864](https://github.com/kortyx-io/kortyx/commit/89c6864191527a9f13598a4c6e70cad38bb0c68e))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @kortyx/agent bumped to 0.26.2
    * @kortyx/telemetry bumped to 0.9.0
    * kortyx bumped to 0.24.2

## [0.9.1](https://github.com/kortyx-io/kortyx/compare/studio-v0.9.0...studio-v0.9.1) (2026-09-21)


### Bug Fixes

* preserve interrupt control flow and Studio compatibility ([#226](https://github.com/kortyx-io/kortyx/issues/226)) ([72ba7c2](https://github.com/kortyx-io/kortyx/commit/72ba7c2b9a467db0e54b5a4ab5844c8d7f895135))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/telemetry-contracts bumped to 0.11.1
  * devDependencies
    * @kortyx/agent bumped to 0.26.1
    * @kortyx/telemetry bumped to 0.8.2
    * kortyx bumped to 0.24.1

## [0.9.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.8.0...studio-v0.9.0) (2026-09-21)


### Features

* **hooks:** add model-driven interrupt contracts to useReason ([#224](https://github.com/kortyx-io/kortyx/issues/224)) ([e0147d5](https://github.com/kortyx-io/kortyx/commit/e0147d5234ca38d450d452af924b242f8cbdeb16))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/telemetry-contracts bumped to 0.11.0
  * devDependencies
    * @kortyx/agent bumped to 0.26.0
    * @kortyx/telemetry bumped to 0.8.1
    * kortyx bumped to 0.24.0

## [0.8.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.7.1...studio-v0.8.0) (2026-09-21)


### Features

* **observability:** report handled workflow errors ([#222](https://github.com/kortyx-io/kortyx/issues/222)) ([68a3b0e](https://github.com/kortyx-io/kortyx/commit/68a3b0eea5d93cb89bdcef63c4767f3b0d59e60d))


### Bug Fixes

* **studio:** explain workflow status indicators ([#221](https://github.com/kortyx-io/kortyx/issues/221)) ([58f3ace](https://github.com/kortyx-io/kortyx/commit/58f3acee7fef4f3bca2f093d23a2b46039fe5095))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/telemetry-contracts bumped to 0.10.0
  * devDependencies
    * @kortyx/agent bumped to 0.25.1
    * @kortyx/telemetry bumped to 0.8.0
    * kortyx bumped to 0.23.0

## [0.7.1](https://github.com/kortyx-io/kortyx/compare/studio-v0.7.0...studio-v0.7.1) (2026-09-19)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * kortyx bumped to 0.22.1

## [0.7.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.6.0...studio-v0.7.0) (2026-09-18)


### Features

* **tools:** add useTool and first-class Studio observability ([#215](https://github.com/kortyx-io/kortyx/issues/215)) ([224c92d](https://github.com/kortyx-io/kortyx/commit/224c92d73caead320dd14582d8b624efc3252c9f))


### Bug Fixes

* **studio:** render workflow start and end boundaries ([#214](https://github.com/kortyx-io/kortyx/issues/214)) ([968cc80](https://github.com/kortyx-io/kortyx/commit/968cc805138da2989d8c96d42351bc2687ee787e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/telemetry-contracts bumped to 0.9.0
  * devDependencies
    * @kortyx/agent bumped to 0.25.0
    * @kortyx/telemetry bumped to 0.7.0
    * kortyx bumped to 0.22.0

## [0.6.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.5.2...studio-v0.6.0) (2026-09-16)


### Features

* **studio:** surface consumer feedback and human reviews ([#209](https://github.com/kortyx-io/kortyx/issues/209)) ([b757879](https://github.com/kortyx-io/kortyx/commit/b757879ab72c3bb3bf3d5c8f2d10611606834cf6))


### Bug Fixes

* **studio:** restore drawer stacks across cyclic history ([#208](https://github.com/kortyx-io/kortyx/issues/208)) ([a0b67ee](https://github.com/kortyx-io/kortyx/commit/a0b67ee38bf5dde54d66bca846c14235beefad20))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/telemetry-contracts bumped to 0.8.0

## [0.5.2](https://github.com/kortyx-io/kortyx/compare/studio-v0.5.1...studio-v0.5.2) (2026-09-16)


### Bug Fixes

* **studio:** retain inspector exit position until removal ([#202](https://github.com/kortyx-io/kortyx/issues/202)) ([a0fe62c](https://github.com/kortyx-io/kortyx/commit/a0fe62c607c987a8a9a480c43c55d24484431868))

## [0.5.1](https://github.com/kortyx-io/kortyx/compare/studio-v0.5.0...studio-v0.5.1) (2026-09-16)


### Bug Fixes

* **studio:** harden Run, Session, and Interrupt navigation ([#199](https://github.com/kortyx-io/kortyx/issues/199)) ([7830e1c](https://github.com/kortyx-io/kortyx/commit/7830e1ceb010ee79f939b1539e348c654297fcf5))
* **studio:** prevent trace inspector exit replay ([#198](https://github.com/kortyx-io/kortyx/issues/198)) ([8723389](https://github.com/kortyx-io/kortyx/commit/872338935767bd9af8c35aa6dae5dceadbe749ca))

## [0.5.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.4.0...studio-v0.5.0) (2026-09-15)


### Features

* **studio:** support highly available runtimes ([#192](https://github.com/kortyx-io/kortyx/issues/192)) ([450bf3c](https://github.com/kortyx-io/kortyx/commit/450bf3c5099b9520eef5dc43542bfc2b83501986))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/telemetry-contracts bumped to 0.7.0

## [0.4.0](https://github.com/kortyx-io/kortyx/compare/studio-v0.3.2...studio-v0.4.0) (2026-09-15)


### Features

* **aws-cdk:** add Kortyx Studio deployment construct ([#188](https://github.com/kortyx-io/kortyx/issues/188)) ([bb4412c](https://github.com/kortyx-io/kortyx/commit/bb4412c4b72044c2e9c681d6b923ccda2d132109))

## [0.3.2](https://github.com/kortyx-io/kortyx/compare/studio-v0.3.1...studio-v0.3.2) (2026-09-14)


### Bug Fixes

* **studio:** preserve host ownership of updater state ([#186](https://github.com/kortyx-io/kortyx/issues/186)) ([45c5b0c](https://github.com/kortyx-io/kortyx/commit/45c5b0c9736a1a4af9d4323747af77dbb98c32bf))

## [0.3.1](https://github.com/kortyx-io/kortyx/compare/studio-v0.3.0...studio-v0.3.1) (2026-09-14)


### Bug Fixes

* **studio:** preserve stacked drawers on first navigation ([#182](https://github.com/kortyx-io/kortyx/issues/182)) ([bd7af14](https://github.com/kortyx-io/kortyx/commit/bd7af14bf8a6b2e8196060e8554663b91d0aeff8))

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
