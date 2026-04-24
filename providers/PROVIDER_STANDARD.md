# Provider Package Standard (Kortyx v1)

This document defines the canonical structure and rules for provider packages under `providers/*`.

## Goals

- Keep provider packages small, consistent, and automatable.
- Keep `@kortyx/providers` as contracts + registry only.
- Avoid provider-specific architecture drift.
- Avoid provider-name repetition in filenames and exported API names.
- Make provider results operationally useful with normalized metadata.

## Scope (Current v1)

Provider packages in v1 support only:

- text generation (`invoke`)
- streaming text generation (`stream`)
- normalized metadata for reasoning-oriented model calls

Out of scope for v1:

- embeddings
- image/video generation
- tool calling/function calling
- advanced provider-specific features

## Monorepo Layout

- Core contracts/registry: `packages/providers` (`@kortyx/providers`)
- Concrete providers: `providers/<slug>` (`@kortyx/<slug>`)

Examples:

- `providers/google` -> `@kortyx/google`
- `providers/openai` -> `@kortyx/openai`

## Required Package Structure

Each provider package MUST follow this structure:

```text
providers/<slug>/
├── src/
│   ├── index.ts
│   ├── provider.ts
│   ├── client.ts
│   ├── models.ts
│   ├── messages.ts
│   ├── errors.ts
│   └── types.ts
├── test/
│   ├── conformance.test.ts
│   └── fixtures/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── README.md
└── CHANGELOG.md
```

Notes:

- Keep folder naming lowercase with hyphens only.
- Use generic filenames (`provider.ts`, `models.ts`, etc.).
- Do not create provider-specific filenames like `google-provider.ts`.

## Naming Rules

- Package name: `@kortyx/<slug>`
- Provider id constant: `PROVIDER_ID`
- Model list constant: `MODELS`
- Public factory function: `createProvider`
- Optional provider settings type: `ProviderSettings`

Do not export provider-specific names as the primary API.

## Public Export Contract

Every provider package MUST export these from `src/index.ts`:

- `PROVIDER_ID`
- `MODELS`
- `createProvider`

Optional exports:

- provider-specific types from `types.ts`

## Contract Rules

All provider implementations MUST satisfy `@kortyx/providers` contracts:

- `ProviderInstance`
- `ProviderModelRef`
- `KortyxModel`
- `KortyxPromptMessage`
- `KortyxStreamPart`
- `KortyxInvokeResult`
- `ModelOptions`

Provider packages must return a real provider instance. Model refs must carry the provider instance, not only a string provider id.

Normalized call options currently include:

- `temperature`
- `streaming`
- `maxOutputTokens`
- `stopSequences`
- `abortSignal`
- `reasoning`
- `responseFormat`
- `providerOptions`

Normalized invoke results currently include:

- `content`
- `raw`
- `usage`
- `finishReason`
- `warnings`
- `providerMetadata`

Normalized internal stream parts currently include:

- `text-delta`
- `finish`
- `error`
- optional `raw`

## Dependency Rules

- MUST depend on `@kortyx/providers`.
- MUST NOT depend on LangChain provider wrappers (`@langchain/*`) for provider implementation.
- SHOULD use the provider's official SDK or direct HTTP APIs.
- Keep dependencies minimal and provider-specific.

## Runtime Behavior Rules

- `stream(messages)` must yield typed `KortyxStreamPart` values, not raw strings.
- `stream(messages)` should emit one or more `text-delta` parts and a terminal `finish` part for successful calls.
- `invoke(messages)` should return normalized metadata whenever the provider exposes it.
- Respect normalized `ModelOptions` when the provider supports them.
- If a generic option is not supported, surface a warning instead of silently dropping it.
- Handle system prompts consistently and map them to provider-native request format.
- Forward `abortSignal` to the underlying transport.

## Error Handling Rules

- Throw clear configuration errors for missing API key.
- Throw clear runtime errors for request failures.
- Include provider context in error messages.
- Do not leak secrets in error text.
- Streaming providers may emit an internal `error` stream part, but callers must still observe a failed operation.

## Conformance

Every provider package should include `test/conformance.test.ts` and use the shared helper under `packages/providers/test/conformance.ts`.

The minimum conformance surface is:

- `invoke` normalizes `usage`, `finishReason`, `warnings`, and `providerMetadata`
- `stream` emits typed parts plus a terminal `finish`
- `abortSignal` is forwarded to transport
- unsupported generic options are surfaced via warnings when applicable

## package.json Baseline

Each provider package SHOULD include:

- `"sideEffects": false`
- `build`, `type-check`, `lint`, `test` scripts
- `main` + `types` + `exports` for `.`
- repository `directory` pointing to `providers/<slug>`

## Validation Checklist

Before merging a provider package:

1. `pnpm install`
2. `pnpm -C providers/<slug> build`
3. `pnpm -C providers/<slug> type-check`
4. `pnpm -C providers/<slug> test`
5. `pnpm turbo run type-check --filter=@kortyx/<slug> --filter=@kortyx/providers --filter=@kortyx/runtime --filter=@kortyx/agent --filter=kortyx`
6. Runtime smoke import succeeds:
   - `import("@kortyx/<slug>")`

## Automation Readiness Rules

- Keep the same file and export structure for all providers.
- Keep v1 feature surface minimal and identical across providers.
- Avoid one-off provider APIs in shared contracts.
- Add provider-specific advanced features only after core providers are stable.
