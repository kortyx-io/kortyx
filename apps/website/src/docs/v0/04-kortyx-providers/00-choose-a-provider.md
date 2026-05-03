---
id: v0-choose-a-provider
title: "Choose a Provider"
description: "Pick a Kortyx provider package, configure credentials, and understand the current provider scope."
keywords: [kortyx, providers, ai providers, openai, anthropic, google, deepseek, groq, mistral]
sidebar_label: "Choose a Provider"
---
# Choose a Provider

Kortyx provider packages let your app choose models explicitly at the `useReason(...)` call site.

Use this page to pick a package, set the right environment variables, and then jump into the provider-specific setup page.

## Provider package map

| Provider | Package | Typical first model | Environment variables | Good first fit |
| --- | --- | --- | --- | --- |
| Google Gemini | `@kortyx/google` | `gemini-2.5-flash` | `GOOGLE_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `KORTYX_GOOGLE_API_KEY`, `KORTYX_GEMINI_API_KEY` | Gemini-first apps and Google AI Studio keys |
| OpenAI | `@kortyx/openai` | `gpt-4.1-mini` | `OPENAI_API_KEY`, `KORTYX_OPENAI_API_KEY` | OpenAI chat-completions models and GPT-family defaults |
| Anthropic | `@kortyx/anthropic` | `claude-sonnet-4-5` | `ANTHROPIC_API_KEY`, `KORTYX_ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `KORTYX_ANTHROPIC_AUTH_TOKEN` | Claude text generation and Anthropic thinking controls |
| DeepSeek | `@kortyx/deepseek` | `deepseek-chat` | `DEEPSEEK_API_KEY`, `KORTYX_DEEPSEEK_API_KEY` | DeepSeek chat and reasoner models |
| Groq | `@kortyx/groq` | `llama-3.3-70b-versatile` | `GROQ_API_KEY`, `KORTYX_GROQ_API_KEY` | Groq-hosted low-latency model access |
| Mistral | `@kortyx/mistral` | `mistral-large-latest` | `MISTRAL_API_KEY`, `KORTYX_MISTRAL_API_KEY` | Mistral, Magistral, Ministral, and Pixtral model families |

> **Good to know:** The model ids above are starter choices from the package autocomplete lists. Provider packages also accept arbitrary provider model id strings when the underlying API supports them.

## Install the package you need

Install only the provider packages your app uses.

```bash tabs="install-provider-example" tab="pnpm"
pnpm add @kortyx/google
```

```bash tabs="install-provider-example" tab="npm"
npm install @kortyx/google
```

```bash tabs="install-provider-example" tab="yarn"
yarn add @kortyx/google
```

```bash tabs="install-provider-example" tab="bun"
bun add @kortyx/google
```

Use the provider-specific page if you need package-specific install commands:

- [Google Generative AI](./01-google-generative-ai-provider.md)
- [OpenAI](./02-openai-provider.md)
- [Anthropic](./03-anthropic-provider.md)
- [DeepSeek](./04-deepseek-provider.md)
- [Groq](./05-groq-provider.md)
- [Mistral](./06-mistral-provider.md)

## Centralize provider imports

Create one app-owned provider file so workflow and node code imports models from one place.

```ts
// src/lib/providers.ts
export { google } from "@kortyx/google";
export { openai } from "@kortyx/openai";
export { anthropic } from "@kortyx/anthropic";
```

```js
// src/lib/providers.js
export { google } from "@kortyx/google";
export { openai } from "@kortyx/openai";
export { anthropic } from "@kortyx/anthropic";
```

Then choose a model where your node actually reasons:

```ts
import { useReason } from "kortyx";
import { google } from "@/lib/providers";

const result = await useReason({
  model: google("gemini-2.5-flash"),
  input: "Summarize this support ticket in one sentence.",
  emit: true,
  stream: true,
});
```

```js
import { useReason } from "kortyx";
import { google } from "@/lib/providers";

const result = await useReason({
  model: google("gemini-2.5-flash"),
  input: "Summarize this support ticket in one sentence.",
  emit: true,
  stream: true,
});
```

## Use explicit provider setup when the app owns config

The default provider exports read supported environment variables on first use. Use factory functions when your app needs explicit keys, custom API URLs, or a custom `fetch`.

```ts
// src/lib/providers.ts
import { createGoogleGenerativeAI } from "@kortyx/google";
import { createOpenAI } from "@kortyx/openai";

export const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: process.env.OPENAI_BASE_URL,
});
```

```js
// src/lib/providers.js
import { createGoogleGenerativeAI } from "@kortyx/google";
import { createOpenAI } from "@kortyx/openai";

export const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: process.env.OPENAI_BASE_URL,
});
```

> **Good to know:** Kortyx provider settings use `baseUrl` with a lowercase `l`. Some adjacent ecosystem docs use `baseURL`; keep the Kortyx spelling when configuring these packages.

## Current provider scope

Kortyx provider packages currently focus on language model text generation through `useReason(...)`.

They support:

- model refs passed to `useReason(...)`
- streaming and non-streaming text invocation
- normalized `usage`, `finishReason`, `providerMetadata`, `warnings`, and `raw`
- provider-specific options through `providerOptions`

They do not currently expose provider-native APIs for:

- embeddings
- image generation
- audio, speech, or transcription
- file upload APIs
- provider-hosted tools or tool execution

Use `result.warnings` when you rely on advanced normalized options. Providers report unsupported or compatibility-mapped options there instead of silently pretending every provider behaves the same.

## Provider options

Provider-specific options are usually namespaced under the provider id:

```ts
const result = await useReason({
  model: openai("gpt-4.1-mini"),
  input: "Return a compact JSON summary.",
  responseFormat: {
    type: "json",
  },
  providerOptions: {
    openai: {
      strictJsonSchema: true,
    },
  },
});
```

```js
const result = await useReason({
  model: openai("gpt-4.1-mini"),
  input: "Return a compact JSON summary.",
  responseFormat: {
    type: "json",
  },
  providerOptions: {
    openai: {
      strictJsonSchema: true,
    },
  },
});
```

```ts
const result = await useReason({
  model: deepseek("deepseek-reasoner"),
  input: "Solve this step by step.",
  providerOptions: {
    deepseek: {
      thinking: {
        type: "enabled",
      },
    },
  },
});
```

```js
const result = await useReason({
  model: deepseek("deepseek-reasoner"),
  input: "Solve this step by step.",
  providerOptions: {
    deepseek: {
      thinking: {
        type: "enabled",
      },
    },
  },
});
```

## Next steps

- Pick a provider-specific setup page from the package map above
- See [Hooks](../02-core-concepts/07-hooks.md) for `useReason(...)` behavior and structured output
- See [Provider API](../05-reference/04-provider-api.md) for the shared normalized provider contract
