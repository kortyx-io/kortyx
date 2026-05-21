# @kortyx/providers

[![npm version](https://img.shields.io/npm/v/@kortyx/providers.svg)](https://www.npmjs.com/package/@kortyx/providers)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/providers.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

Provider-agnostic model contracts and registry helpers for Kortyx.

Install concrete provider implementations separately (for example `@kortyx/google`).

## Install

```bash
pnpm add @kortyx/providers
```

```bash
npm install @kortyx/providers
```

## Concrete Providers

| Provider | Package | Factory |
| --- | --- | --- |
| Google Gemini | `@kortyx/google` | `google(...)` |
| OpenAI | `@kortyx/openai` | `openai(...)` |
| Anthropic | `@kortyx/anthropic` | `anthropic(...)` |
| DeepSeek | `@kortyx/deepseek` | `deepseek(...)` |
| Groq | `@kortyx/groq` | `groq(...)` |
| Mistral | `@kortyx/mistral` | `mistral(...)` |

## Key APIs

- `ProviderModelRef`
- `ProviderInstance`
- `KortyxInvokeResult`
- `KortyxStreamChunk`
- `createProviderRegistry(...)`
- `registerProvider(...)`
- `getProvider(...)`
- `getAvailableModels(...)`

## Documentation

- [Documentation](https://kortyx.io/docs)
- [Choose a provider](https://kortyx.io/docs/kortyx-providers/choose-a-provider)
- [Provider API](https://kortyx.io/docs/reference/provider-api)
- [Package overview](https://kortyx.io/docs/reference/package-overview)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
