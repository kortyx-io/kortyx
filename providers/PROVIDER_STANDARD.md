# Provider Package Standard (Kortyx v1)

This document defines the canonical structure and rules for provider packages under `providers/*`.

## Goals

- Keep provider packages small, consistent, and automatable.
- Keep `@kortyx/providers` as contracts + registry only.
- Avoid provider-specific architecture drift.
- Avoid provider-name repetition in filenames and exported API names.

## Scope (v1)

Provider packages in v1 support only:

- text generation (`invoke`)
- streaming text generation (`stream`)

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

- `ProviderConfig`
- `KortyxModel`
- `KortyxPromptMessage`
- `KortyxStreamChunk`
- `KortyxInvokeResult`

Provider packages must return `ProviderConfig` with a `models` map that creates `KortyxModel` instances.

## Dependency Rules

- MUST depend on `@kortyx/providers`.
- MUST NOT depend on LangChain provider wrappers (`@langchain/*`) for provider implementation.
- SHOULD use the provider's official SDK or direct HTTP APIs.
- Keep dependencies minimal and provider-specific.

## Runtime Behavior Rules

- `stream(messages)` must yield text progressively (`string` or `KortyxStreamChunk`).
- `invoke(messages)` must return `{ role: "assistant", content, raw? }`.
- Respect `temperature` and `streaming` model flags.
- Handle system prompts consistently and map them to provider-native request format.

## Error Handling Rules

- Throw clear configuration errors for missing API key.
- Throw clear runtime errors for request failures.
- Include provider context in error messages.
- Do not leak secrets in error text.

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
4. `pnpm turbo run type-check --filter=@kortyx/<slug> --filter=@kortyx/providers --filter=@kortyx/runtime --filter=@kortyx/agent --filter=kortyx`
5. Runtime smoke import succeeds:
   - `import("@kortyx/<slug>")`

## Automation Readiness Rules

- Keep the same file and export structure for all providers.
- Keep v1 feature surface minimal and identical across providers.
- Avoid one-off provider APIs in shared contracts.
- Add provider-specific advanced features only after core providers are stable.
