---
name: add-provider-package
description: Use when creating or updating a Kortyx provider package under providers/<slug> (for example @kortyx/google, @kortyx/openai). Enforces the Provider Standard, v1 narrow scope (text + streaming text), generic filenames, and generic exports (PROVIDER_ID, MODELS, createProvider).
---

# Add Provider Package

## Purpose

Create consistent provider packages that plug into `@kortyx/providers` and scale to many providers.

## Mandatory Inputs

- provider slug (e.g. `google`, `openai`)
- npm package name (must be `@kortyx/<slug>`)
- provider id string

If any input is missing, ask the user before creating files.

## Required References

Read before making changes:

1. `providers/PROVIDER_STANDARD.md`
2. `packages/providers/src/types.ts`
3. existing provider package under `providers/*` (for script/build parity)

## Rules

- Keep v1 scope narrow: `invoke` + `stream` only.
- Do not add embeddings/images/tools in initial provider package.
- Do not use `@langchain/*` wrappers in provider implementation.
- Use `@kortyx/providers` contracts exactly.
- Use generic filenames and generic export names.

## Standard File Layout

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

## Required Exports (`src/index.ts`)

- `PROVIDER_ID`
- `MODELS`
- `createProvider`

Avoid provider-specific export names as the primary API.

## Workflow

1. Create package folder and files using the standard layout.
2. Set package metadata:
- `name: @kortyx/<slug>`
- repository directory: `providers/<slug>`
3. Implement provider in `src/provider.ts`:
- export `PROVIDER_ID`
- export `MODELS`
- export `createProvider`
4. Keep provider-specific request/response mapping isolated in `client.ts`, `messages.ts`, and `errors.ts`.
5. Add dependencies:
- required: `@kortyx/providers`
- provider SDK or direct HTTP utilities
- never LangChain provider wrappers
6. Update references where needed:
- example app dependency
- docs mentioning provider package name
- agent provider resolver mapping (if needed)
7. Run validation commands.

## Validation Commands

From repo root:

```bash
pnpm install
pnpm -C providers/<slug> build
pnpm -C providers/<slug> type-check
pnpm turbo run type-check --filter=@kortyx/<slug> --filter=@kortyx/providers --filter=@kortyx/runtime --filter=@kortyx/agent --filter=kortyx
```

Optional runtime smoke check:

```bash
node -e "import('@kortyx/<slug>').then(m=>console.log(Object.keys(m)))"
```

## Done Criteria

- Package compiles and type-checks.
- `@kortyx/<slug>` resolves at runtime.
- Provider follows `providers/PROVIDER_STANDARD.md`.
- No LangChain provider-wrapper dependencies introduced.
