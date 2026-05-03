---
id: v0-groq-provider
title: "Groq Provider"
description: "Use Groq-hosted models in Kortyx with the batteries-included groq export or an explicit provider instance."
keywords: [kortyx, groq, provider, llama, gpt-oss, qwen]
sidebar_label: "Groq"
---
# Groq Provider

`@kortyx/groq` is the Groq provider package for Kortyx.

It gives you two entry points:

- `groq`: a batteries-included default provider selector
- `createGroq(...)`: an explicit factory for custom setup

## 1. Install the package

```bash tabs="install-groq-provider" tab="pnpm"
pnpm add @kortyx/groq
```

```bash tabs="install-groq-provider" tab="npm"
npm install @kortyx/groq
```

```bash tabs="install-groq-provider" tab="yarn"
yarn add @kortyx/groq
```

```bash tabs="install-groq-provider" tab="bun"
bun add @kortyx/groq
```

## 2. What the package exports

```ts
import { MODELS, PROVIDER_ID, createGroq, groq } from "@kortyx/groq";
```

```js
import { MODELS, PROVIDER_ID, createGroq, groq } from "@kortyx/groq";
```

What each export is for:

- `groq`: default provider selector for the fastest start
- `createGroq(...)`: custom provider instance with explicit settings
- `MODELS`: built-in Groq model ids exposed by the package
- `PROVIDER_ID`: the provider id string, currently `"groq"`

## 3. Basic usage in the same file

```ts
import { groq } from "@kortyx/groq";

const model = groq("llama-3.3-70b-versatile");
```

```js
import { groq } from "@kortyx/groq";

const model = groq("llama-3.3-70b-versatile");
```

`groq` is a provider selector, which means:

- it is callable: `groq("llama-3.3-70b-versatile")`
- it also exposes provider metadata: `groq.id`, `groq.models`

```ts
groq.id; // "groq"
groq.models; // readonly list of built-in model ids
```

```js
groq.id; // "groq"
groq.models; // readonly list of built-in model ids
```

> **Good to know:** The built-in model list gives autocomplete, but arbitrary Groq-compatible model ids are accepted as strings.

## 4. Shared app bootstrap usage

If you want one shared import path across your app, re-export `groq` from a bootstrap file such as `src/lib/providers.ts`.

```ts
// src/lib/providers.ts
export { groq } from "@kortyx/groq";
```

```js
// src/lib/providers.js
export { groq } from "@kortyx/groq";
```

Then import it from that file where you actually use it:

```ts
// src/nodes/chat.node.ts
import { groq } from "@/lib/providers";
```

```js
// src/nodes/chat.node.js
import { groq } from "@/lib/providers";
```

## 5. Advanced usage with explicit settings

Use `createGroq(...)` when you want app-owned configuration instead of the default environment-based setup.

```ts
import { createGroq } from "@kortyx/groq";

export const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});
```

```js
import { createGroq } from "@kortyx/groq";

export const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});
```

Use the factory when you need to:

- pass `apiKey` explicitly
- use a custom `baseUrl`
- provide a custom `fetch`

## 6. Credentials and first-use behavior

The default `groq` export resolves credentials on first use, not at import time.

Supported environment variables:

- `GROQ_API_KEY`
- `KORTYX_GROQ_API_KEY`

If neither variable is set and you did not pass `apiKey` to `createGroq(...)`, the provider throws a configuration error the first time a Groq model is actually used.

## 7. Create model refs for workflow and node params

```ts
params: {
  model: groq("llama-3.3-70b-versatile"),
  temperature: 0.3,
}
```

```js
params: {
  model: groq("llama-3.3-70b-versatile"),
  temperature: 0.3,
}
```

You can also attach default model options to the ref itself:

```ts
const model = groq("qwen/qwen3-32b", {
  providerOptions: {
    groq: {
      reasoningFormat: "parsed",
      serviceTier: "auto",
    },
  },
});
```

```js
const model = groq("qwen/qwen3-32b", {
  providerOptions: {
    groq: {
      reasoningFormat: "parsed",
      serviceTier: "auto",
    },
  },
});
```

Those become default options for later `useReason(...)` calls unless you override them at call time.

## 8. Use the model with `useReason(...)`

```ts
import { useReason } from "kortyx";
import { groq } from "@/lib/providers";

const result = await useReason({
  model: groq("llama-3.3-70b-versatile"),
  input: "Write a concise answer for a support engineer.",
  temperature: 0.3,
  emit: true,
  stream: true,
});

result.text;
result.usage;
result.finishReason;
result.providerMetadata;
result.warnings;
```

```js
import { useReason } from "kortyx";
import { groq } from "@/lib/providers";

const result = await useReason({
  model: groq("llama-3.3-70b-versatile"),
  input: "Write a concise answer for a support engineer.",
  temperature: 0.3,
  emit: true,
  stream: true,
});

result.text;
result.usage;
result.finishReason;
result.providerMetadata;
result.warnings;
```

> **Good to know:** Provider setup is not done on `createAgent(...)`. Model selection happens where you call `useReason(...)` by passing a model ref.

## 9. Supported normalized call options

Groq currently maps these generic Kortyx options:

- `temperature`
- `streaming`
- `maxOutputTokens`
- `stopSequences`
- `abortSignal`
- `reasoning.effort`
- `reasoning.maxTokens`
- `responseFormat.type`
- `responseFormat.schema`

Current Groq provider options:

- `providerOptions.groq.reasoningFormat`
- `providerOptions.groq.reasoningEffort`
- `providerOptions.groq.serviceTier`
- `providerOptions.groq.structuredOutputs`
- `providerOptions.groq.strictJsonSchema`

Current mapping details:

- `responseFormat.type: "json"` maps to Groq JSON mode
- `responseFormat.schema` maps to Groq JSON schema output unless `structuredOutputs` is `false`
- generic reasoning effort maps to Groq `none`, `low`, `medium`, or `high`
- `temperature` defaults to `0.7` when you do not set it

Current warning-backed gaps:

- Groq does not expose a generic reasoning token budget through this provider
- unsupported generic reasoning effort values are reported in `result.warnings`
- unknown `providerOptions` keys are ignored and reported in `result.warnings`

## 10. Normalized metadata you get back

Groq returns the normalized Kortyx result fields when the API provides them:

- `usage`
- `finishReason`
- `providerMetadata`
- `warnings`
- `raw`

Groq-specific metadata currently includes fields such as:

- `providerId`
- `modelId`
- `responseId`
- `responseModel`
- `created`
- `usage`
- `cachedTokens`
- `reasoningTokens`

Use `providerMetadata` when you need debugging or observability details without coupling your app code to the raw provider payload shape.

## Supported scope

`@kortyx/groq` currently supports text generation through Groq chat completions via `useReason(...)`, including streaming and non-streaming invocation.

It does not currently expose Groq transcription, browser search, embeddings, image generation, file APIs, or provider-hosted tools. Check `result.warnings` when you rely on advanced generic options and want to verify how Groq handled them.

## Available built-in Groq model ids

- `llama-3.1-8b-instant`
- `llama-3.3-70b-versatile`
- `openai/gpt-oss-120b`
- `openai/gpt-oss-20b`
- `qwen/qwen3-32b`

## Next steps

- See [Hooks](../02-core-concepts/07-hooks.md) for `useReason(...)` behavior and structured output
- See [Provider API](../05-reference/04-provider-api.md) for the shared normalized provider contract
