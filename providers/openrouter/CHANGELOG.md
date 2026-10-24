# @kortyx/openrouter

## Unreleased

### Bug Fixes

- Report confirmed parameter-routing 404s as `PROVIDER_PARAMETER_UNSUPPORTED`,
  including requested parameter names, tool/output versus other controls and
  the automatic/explicit/default source of `requireParameters`. Explain the
  existing explicit override and preset visibility limits. Preserve original
  developer-facing messages and private SDK causes; recognize numeric/string
  codes and structured routing evidence. Surface malformed SDK responses as
  `PROVIDER_INVALID_RESPONSE` with partial usage. Keep request defaults and
  automatic retry behavior unchanged.


## [0.2.8](https://github.com/kortyx-io/kortyx/compare/openrouter-v0.2.7...openrouter-v0.2.8) (2026-10-24)


### Bug Fixes

* **studio:** refine eval controls, tables and grading timeouts ([646718b](https://github.com/kortyx-io/kortyx/commit/646718b95f0372a3f96d88a65fe1a4a709a31c34))

## [0.2.7](https://github.com/kortyx-io/kortyx/compare/openrouter-v0.2.6...openrouter-v0.2.7) (2026-10-16)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.15.0
    * @kortyx/providers bumped to 0.9.4

## [0.2.6](https://github.com/kortyx-io/kortyx/compare/openrouter-v0.2.5...openrouter-v0.2.6) (2026-10-13)


### Bug Fixes

* **openrouter:** explain parameter routing failures ([#338](https://github.com/kortyx-io/kortyx/issues/338)) ([193a287](https://github.com/kortyx-io/kortyx/commit/193a28794b6f05626a2d69148fa8592fcd5956e9))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.14.0
    * @kortyx/providers bumped to 0.9.3

## [0.2.5](https://github.com/kortyx-io/kortyx/compare/openrouter-v0.2.4...openrouter-v0.2.5) (2026-10-11)


### Bug Fixes

* **website:** reconcile credibility branch with current main ([60199f9](https://github.com/kortyx-io/kortyx/commit/60199f992242eb7c409a95bc7a6898d31bac601d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.13.1
    * @kortyx/providers bumped to 0.9.2

## [0.2.4](https://github.com/kortyx-io/kortyx/compare/openrouter-v0.2.3...openrouter-v0.2.4) (2026-10-09)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.13.0
    * @kortyx/providers bumped to 0.9.1

## [0.2.3](https://github.com/kortyx-io/kortyx/compare/openrouter-v0.2.2...openrouter-v0.2.3) (2026-10-08)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/core bumped to 0.12.0
    * @kortyx/providers bumped to 0.9.0

## [0.2.2](https://github.com/kortyx-io/kortyx/compare/openrouter-v0.2.1...openrouter-v0.2.2) (2026-10-07)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @kortyx/providers bumped to 0.8.4

## [0.2.1](https://github.com/kortyx-io/kortyx/compare/openrouter-v0.2.0...openrouter-v0.2.1) (2026-09-24)


### Bug Fixes

* **openrouter:** disable strict tool schemas by default ([#241](https://github.com/kortyx-io/kortyx/issues/241)) ([ef3e53a](https://github.com/kortyx-io/kortyx/commit/ef3e53ac4f76cea84f54eb0e27ab787dd62eedc6))

## [0.2.0](https://github.com/kortyx-io/kortyx/compare/openrouter-v0.1.0...openrouter-v0.2.0) (2026-09-23)


### Features

* **chat:** add server-side transcript lifecycle hooks ([#240](https://github.com/kortyx-io/kortyx/issues/240)) ([f84a674](https://github.com/kortyx-io/kortyx/commit/f84a6749819ee7bab343efb03f38eae743de0655))
* **providers:** add OpenRouter and Jev support ([#230](https://github.com/kortyx-io/kortyx/issues/230)) ([7a6ac2c](https://github.com/kortyx-io/kortyx/commit/7a6ac2c2171850fa89f041e66c980521409e6819))

## 0.1.0

### Minor Changes

- Add the first-class OpenRouter language-model provider using the official
  OpenRouter SDK.
- Add TypeSafe Jev as a regular `useReason` model through the typed
  `jevOutputSchema` helper and OpenRouter's native System One endpoint.
