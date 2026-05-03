---
id: v0-openai-provider
title: "OpenAI Provider"
description: "Use OpenAI models in Kortyx with the batteries-included openai export or an explicit provider instance."
keywords: [kortyx, openai, provider, gpt, o-series]
sidebar_label: "OpenAI"
---
# OpenAI Provider

`@kortyx/openai` is the OpenAI provider package for Kortyx.

It gives you two entry points:

- `openai`: a batteries-included default provider selector
- `createOpenAI(...)`: an explicit factory for custom setup

## 1. Install the package

```bash tabs="install-openai-provider" tab="pnpm"
pnpm add @kortyx/openai
```

```bash tabs="install-openai-provider" tab="npm"
npm install @kortyx/openai
```

```bash tabs="install-openai-provider" tab="yarn"
yarn add @kortyx/openai
```

```bash tabs="install-openai-provider" tab="bun"
bun add @kortyx/openai
```

## 2. What the package exports

```ts
import { MODELS, PROVIDER_ID, createOpenAI, openai } from "@kortyx/openai";
```

```js
import { MODELS, PROVIDER_ID, createOpenAI, openai } from "@kortyx/openai";
```

What each export is for:

- `openai`: default provider selector for the fastest start
- `createOpenAI(...)`: custom provider instance with explicit settings
- `MODELS`: built-in OpenAI model ids exposed by the package
- `PROVIDER_ID`: the provider id string, currently `"openai"`

## 3. Basic usage in the same file

```ts
import { openai } from "@kortyx/openai";

const model = openai("gpt-4.1-mini");
```

```js
import { openai } from "@kortyx/openai";

const model = openai("gpt-4.1-mini");
```

`openai` is a provider selector, which means:

- it is callable: `openai("gpt-4.1-mini")`
- it also exposes provider metadata: `openai.id`, `openai.models`

```ts
openai.id; // "openai"
openai.models; // readonly list of built-in model ids
```

```js
openai.id; // "openai"
openai.models; // readonly list of built-in model ids
```

> **Good to know:** The built-in model list gives autocomplete, but arbitrary OpenAI model ids are accepted as strings.

## 4. Shared app bootstrap usage

If you want one shared import path across your app, re-export `openai` from a bootstrap file such as `src/lib/providers.ts`.

```ts
// src/lib/providers.ts
export { openai } from "@kortyx/openai";
```

```js
// src/lib/providers.js
export { openai } from "@kortyx/openai";
```

Then import it from that file where you actually use it:

```ts
// src/nodes/chat.node.ts
import { openai } from "@/lib/providers";
```

```js
// src/nodes/chat.node.js
import { openai } from "@/lib/providers";
```

## 5. Advanced usage with explicit settings

Use `createOpenAI(...)` when you want app-owned configuration instead of the default environment-based setup.

```ts
import { createOpenAI } from "@kortyx/openai";

export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

```js
import { createOpenAI } from "@kortyx/openai";

export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

Use the factory when you need to:

- pass `apiKey` explicitly
- use a custom `baseUrl`
- provide a custom `fetch`

## 6. Credentials and first-use behavior

The default `openai` export resolves credentials on first use, not at import time.

Supported environment variables:

- `OPENAI_API_KEY`
- `KORTYX_OPENAI_API_KEY`

If neither variable is set and you did not pass `apiKey` to `createOpenAI(...)`, the provider throws a configuration error the first time an OpenAI model is actually used.

## 7. Create model refs for workflow and node params

```ts
params: {
  model: openai("gpt-4.1-mini"),
  temperature: 0.3,
}
```

```js
params: {
  model: openai("gpt-4.1-mini"),
  temperature: 0.3,
}
```

You can also attach default model options to the ref itself:

```ts
const model = openai("gpt-4.1-mini", {
  temperature: 0.2,
  maxOutputTokens: 800,
});
```

```js
const model = openai("gpt-4.1-mini", {
  temperature: 0.2,
  maxOutputTokens: 800,
});
```

Those become default options for later `useReason(...)` calls unless you override them at call time.

## 8. Use the model with `useReason(...)`

```ts
import { useReason } from "kortyx";
import { openai } from "@/lib/providers";

const result = await useReason({
  model: openai("gpt-4.1-mini"),
  input: "Write a concise launch update for our beta users.",
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
import { openai } from "@/lib/providers";

const result = await useReason({
  model: openai("gpt-4.1-mini"),
  input: "Write a concise launch update for our beta users.",
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

OpenAI currently maps these generic Kortyx options:

- `temperature`
- `streaming`
- `maxOutputTokens`
- `stopSequences`
- `abortSignal`
- `reasoning.effort`
- `reasoning.maxTokens`
- `responseFormat.type`
- `responseFormat.schema`

Current OpenAI provider options:

- `providerOptions.openai.reasoningEffort`
- `providerOptions.openai.maxCompletionTokens`
- `providerOptions.openai.serviceTier`
- `providerOptions.openai.store`
- `providerOptions.openai.metadata`
- `providerOptions.openai.systemMessageMode`
- `providerOptions.openai.structuredOutputs`
- `providerOptions.openai.strictJsonSchema`

Current mapping details:

- `responseFormat.type: "json"` maps to OpenAI JSON mode
- `responseFormat.schema` maps to OpenAI structured outputs unless `structuredOutputs` is `false`
- reasoning models use `max_completion_tokens`; non-reasoning models use `max_tokens`
- reasoning model system messages default to OpenAI developer messages

Current warning-backed gaps:

- `temperature` is omitted for OpenAI reasoning models unless `reasoning.effort` is `"none"` on supported newer models
- `reasoning.maxTokens` is not a separate OpenAI reasoning budget; Kortyx maps output token limits to the provider field
- unknown `providerOptions` keys are ignored and reported in `result.warnings`

## 10. Normalized metadata you get back

OpenAI returns the normalized Kortyx result fields when the API provides them:

- `usage`
- `finishReason`
- `providerMetadata`
- `warnings`
- `raw`

OpenAI-specific metadata currently includes fields such as:

- `providerId`
- `modelId`
- `responseId`
- `responseModel`
- `created`
- `usage`
- `cachedTokens`
- `reasoningTokens`
- `acceptedPredictionTokens`
- `rejectedPredictionTokens`

Use `providerMetadata` when you need debugging or observability details without coupling your app code to the raw provider payload shape.

## Supported scope

`@kortyx/openai` currently supports text generation through OpenAI chat completions via `useReason(...)`, including streaming and non-streaming invocation.

It does not currently expose the OpenAI Responses API, embeddings, image generation, audio, transcription, file APIs, or OpenAI-hosted tools. Check `result.warnings` when you rely on advanced generic options and want to verify how OpenAI handled them.

## Available built-in OpenAI model ids

- `gpt-5.4`
- `gpt-5.4-mini`
- `gpt-5.4-nano`
- `gpt-5.4-pro`
- `gpt-4.1`
- `gpt-4.1-mini`
- `gpt-4o`
- `gpt-4o-mini`
- `o4-mini`

## Next steps

- See [Hooks](../02-core-concepts/07-hooks.md) for `useReason(...)` behavior and structured output
- See [Provider API](../05-reference/04-provider-api.md) for the shared normalized provider contract
