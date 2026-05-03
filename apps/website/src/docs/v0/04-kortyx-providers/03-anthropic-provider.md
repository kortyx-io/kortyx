---
id: v0-anthropic-provider
title: "Anthropic Provider"
description: "Use Anthropic Claude models in Kortyx with the batteries-included anthropic export or an explicit provider instance."
keywords: [kortyx, anthropic, claude, provider]
sidebar_label: "Anthropic"
---
# Anthropic Provider

`@kortyx/anthropic` is the Anthropic Claude provider package for Kortyx.

It gives you two entry points:

- `anthropic`: a batteries-included default provider selector
- `createAnthropic(...)`: an explicit factory for custom setup

## 1. Install the package

```bash tabs="install-anthropic-provider" tab="pnpm"
pnpm add @kortyx/anthropic
```

```bash tabs="install-anthropic-provider" tab="npm"
npm install @kortyx/anthropic
```

```bash tabs="install-anthropic-provider" tab="yarn"
yarn add @kortyx/anthropic
```

```bash tabs="install-anthropic-provider" tab="bun"
bun add @kortyx/anthropic
```

## 2. What the package exports

```ts
import {
  MODELS,
  PROVIDER_ID,
  anthropic,
  createAnthropic,
} from "@kortyx/anthropic";
```

```js
import {
  MODELS,
  PROVIDER_ID,
  anthropic,
  createAnthropic,
} from "@kortyx/anthropic";
```

What each export is for:

- `anthropic`: default provider selector for the fastest start
- `createAnthropic(...)`: custom provider instance with explicit settings
- `MODELS`: built-in Anthropic model ids exposed by the package
- `PROVIDER_ID`: the provider id string, currently `"anthropic"`

## 3. Basic usage in the same file

```ts
import { anthropic } from "@kortyx/anthropic";

const model = anthropic("claude-sonnet-4-5");
```

```js
import { anthropic } from "@kortyx/anthropic";

const model = anthropic("claude-sonnet-4-5");
```

`anthropic` is a provider selector, which means:

- it is callable: `anthropic("claude-sonnet-4-5")`
- it also exposes provider metadata: `anthropic.id`, `anthropic.models`

```ts
anthropic.id; // "anthropic"
anthropic.models; // readonly list of built-in model ids
```

```js
anthropic.id; // "anthropic"
anthropic.models; // readonly list of built-in model ids
```

> **Good to know:** The built-in model list gives autocomplete, but arbitrary Anthropic model ids are accepted as strings.

## 4. Shared app bootstrap usage

If you want one shared import path across your app, re-export `anthropic` from a bootstrap file such as `src/lib/providers.ts`.

```ts
// src/lib/providers.ts
export { anthropic } from "@kortyx/anthropic";
```

```js
// src/lib/providers.js
export { anthropic } from "@kortyx/anthropic";
```

Then import it from that file where you actually use it:

```ts
// src/nodes/chat.node.ts
import { anthropic } from "@/lib/providers";
```

```js
// src/nodes/chat.node.js
import { anthropic } from "@/lib/providers";
```

## 5. Advanced usage with explicit settings

Use `createAnthropic(...)` when you want app-owned configuration instead of the default environment-based setup.

```ts
import { createAnthropic } from "@kortyx/anthropic";

export const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

```js
import { createAnthropic } from "@kortyx/anthropic";

export const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

Use the factory when you need to:

- pass `apiKey` explicitly
- pass `authToken` explicitly
- use a custom `baseUrl`
- provide a custom `fetch`

> **Good to know:** `createAnthropic(...)` accepts either `apiKey` or `authToken`, not both.

## 6. Credentials and first-use behavior

The default `anthropic` export resolves credentials on first use, not at import time.

Supported API key environment variables:

- `ANTHROPIC_API_KEY`
- `KORTYX_ANTHROPIC_API_KEY`

Supported auth token environment variables:

- `ANTHROPIC_AUTH_TOKEN`
- `KORTYX_ANTHROPIC_AUTH_TOKEN`

If no supported credential is set and you did not pass credentials to `createAnthropic(...)`, the provider throws a configuration error the first time an Anthropic model is actually used.

## 7. Create model refs for workflow and node params

```ts
params: {
  model: anthropic("claude-sonnet-4-5"),
  temperature: 0.3,
}
```

```js
params: {
  model: anthropic("claude-sonnet-4-5"),
  temperature: 0.3,
}
```

You can also attach default model options to the ref itself:

```ts
const model = anthropic("claude-sonnet-4-5", {
  maxOutputTokens: 800,
  providerOptions: {
    anthropic: {
      topP: 0.9,
    },
  },
});
```

```js
const model = anthropic("claude-sonnet-4-5", {
  maxOutputTokens: 800,
  providerOptions: {
    anthropic: {
      topP: 0.9,
    },
  },
});
```

Those become default options for later `useReason(...)` calls unless you override them at call time.

## 8. Use the model with `useReason(...)`

```ts
import { useReason } from "kortyx";
import { anthropic } from "@/lib/providers";

const result = await useReason({
  model: anthropic("claude-sonnet-4-5"),
  input: "Write a concise project update for our beta users.",
  maxOutputTokens: 800,
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
import { anthropic } from "@/lib/providers";

const result = await useReason({
  model: anthropic("claude-sonnet-4-5"),
  input: "Write a concise project update for our beta users.",
  maxOutputTokens: 800,
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

Anthropic currently maps these generic Kortyx options:

- `temperature`
- `streaming`
- `maxOutputTokens`
- `stopSequences`
- `abortSignal`
- `reasoning.effort`
- `reasoning.maxTokens`
- `reasoning.includeThoughts`
- `responseFormat.type`

Current Anthropic provider options:

- `providerOptions.anthropic.thinking`
- `providerOptions.anthropic.topK`
- `providerOptions.anthropic.top_k`
- `providerOptions.anthropic.topP`
- `providerOptions.anthropic.top_p`

Current mapping details:

- system messages map to Anthropic `system`
- adjacent user or assistant messages are merged for the Messages API
- `responseFormat.type: "json"` maps through system instructions
- `reasoning.*` maps to Anthropic thinking configuration

Current warning-backed gaps:

- `temperature` is omitted when Anthropic thinking is enabled
- Anthropic JSON mode is instruction-based in this provider, not a provider-native JSON schema request
- generic `reasoning.effort` without `reasoning.maxTokens` maps to the minimum supported thinking budget
- unknown `providerOptions` keys are ignored and reported in `result.warnings`

## 10. Normalized metadata you get back

Anthropic returns the normalized Kortyx result fields when the API provides them:

- `usage`
- `finishReason`
- `providerMetadata`
- `warnings`
- `raw`

Anthropic-specific metadata currently includes fields such as:

- `providerId`
- `modelId`
- `responseId`
- `responseModel`
- `stopSequence`
- `usage`
- `cacheReadTokens`
- `cacheWriteTokens`
- `serverToolUse`

Use `providerMetadata` when you need debugging or observability details without coupling your app code to the raw provider payload shape.

## Supported scope

`@kortyx/anthropic` currently supports text generation through the Anthropic Messages API via `useReason(...)`, including streaming and non-streaming invocation.

It does not currently expose provider-native file APIs, skills, tool execution, or multimodal output APIs. Check `result.warnings` when you rely on advanced generic options and want to verify how Anthropic handled them.

## Available built-in Anthropic model ids

- `claude-sonnet-4-5`
- `claude-sonnet-4-5-20250929`
- `claude-haiku-4-5`
- `claude-haiku-4-5-20251001`
- `claude-opus-4-5`
- `claude-opus-4-5-20251101`
- `claude-sonnet-4-0`
- `claude-sonnet-4-20250514`
- `claude-opus-4-1`
- `claude-opus-4-1-20250805`
- `claude-3-haiku-20240307`

## Next steps

- See [Hooks](../02-core-concepts/07-hooks.md) for `useReason(...)` behavior and structured output
- See [Provider API](../05-reference/04-provider-api.md) for the shared normalized provider contract
