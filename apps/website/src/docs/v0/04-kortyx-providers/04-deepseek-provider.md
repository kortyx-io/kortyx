---
id: v0-deepseek-provider
title: "DeepSeek Provider"
description: "Use DeepSeek models in Kortyx with the batteries-included deepseek export or an explicit provider instance."
keywords: [kortyx, deepseek, provider, reasoning]
sidebar_label: "DeepSeek"
---
# DeepSeek Provider

`@kortyx/deepseek` is the DeepSeek provider package for Kortyx.

It gives you two entry points:

- `deepseek`: a batteries-included default provider selector
- `createDeepSeek(...)`: an explicit factory for custom setup

## 1. Install the package

```bash tabs="install-deepseek-provider" tab="pnpm"
pnpm add @kortyx/deepseek
```

```bash tabs="install-deepseek-provider" tab="npm"
npm install @kortyx/deepseek
```

```bash tabs="install-deepseek-provider" tab="yarn"
yarn add @kortyx/deepseek
```

```bash tabs="install-deepseek-provider" tab="bun"
bun add @kortyx/deepseek
```

## 2. What the package exports

```ts
import {
  MODELS,
  PROVIDER_ID,
  createDeepSeek,
  deepseek,
} from "@kortyx/deepseek";
```

```js
import {
  MODELS,
  PROVIDER_ID,
  createDeepSeek,
  deepseek,
} from "@kortyx/deepseek";
```

What each export is for:

- `deepseek`: default provider selector for the fastest start
- `createDeepSeek(...)`: custom provider instance with explicit settings
- `MODELS`: built-in DeepSeek model ids exposed by the package
- `PROVIDER_ID`: the provider id string, currently `"deepseek"`

## 3. Basic usage in the same file

```ts
import { deepseek } from "@kortyx/deepseek";

const model = deepseek("deepseek-chat");
```

```js
import { deepseek } from "@kortyx/deepseek";

const model = deepseek("deepseek-chat");
```

`deepseek` is a provider selector, which means:

- it is callable: `deepseek("deepseek-chat")`
- it also exposes provider metadata: `deepseek.id`, `deepseek.models`

```ts
deepseek.id; // "deepseek"
deepseek.models; // readonly list of built-in model ids
```

```js
deepseek.id; // "deepseek"
deepseek.models; // readonly list of built-in model ids
```

> **Good to know:** The built-in model list gives autocomplete, but arbitrary DeepSeek-compatible model ids are accepted as strings.

## 4. Shared app bootstrap usage

If you want one shared import path across your app, re-export `deepseek` from a bootstrap file such as `src/lib/providers.ts`.

```ts
// src/lib/providers.ts
export { deepseek } from "@kortyx/deepseek";
```

```js
// src/lib/providers.js
export { deepseek } from "@kortyx/deepseek";
```

Then import it from that file where you actually use it:

```ts
// src/nodes/chat.node.ts
import { deepseek } from "@/lib/providers";
```

```js
// src/nodes/chat.node.js
import { deepseek } from "@/lib/providers";
```

## 5. Advanced usage with explicit settings

Use `createDeepSeek(...)` when you want app-owned configuration instead of the default environment-based setup.

```ts
import { createDeepSeek } from "@kortyx/deepseek";

export const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
});
```

```js
import { createDeepSeek } from "@kortyx/deepseek";

export const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
});
```

Use the factory when you need to:

- pass `apiKey` explicitly
- use a custom `baseUrl`
- provide a custom `fetch`

## 6. Credentials and first-use behavior

The default `deepseek` export resolves credentials on first use, not at import time.

Supported environment variables:

- `DEEPSEEK_API_KEY`
- `KORTYX_DEEPSEEK_API_KEY`

If neither variable is set and you did not pass `apiKey` to `createDeepSeek(...)`, the provider throws a configuration error the first time a DeepSeek model is actually used.

## 7. Create model refs for workflow and node params

```ts
params: {
  model: deepseek("deepseek-chat"),
  temperature: 0.3,
}
```

```js
params: {
  model: deepseek("deepseek-chat"),
  temperature: 0.3,
}
```

You can also attach default model options to the ref itself:

```ts
const model = deepseek("deepseek-reasoner", {
  maxOutputTokens: 800,
  reasoning: {
    effort: "high",
  },
});
```

```js
const model = deepseek("deepseek-reasoner", {
  maxOutputTokens: 800,
  reasoning: {
    effort: "high",
  },
});
```

Those become default options for later `useReason(...)` calls unless you override them at call time.

## 8. Use the model with `useReason(...)`

```ts
import { useReason } from "kortyx";
import { deepseek } from "@/lib/providers";

const result = await useReason({
  model: deepseek("deepseek-chat"),
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
import { deepseek } from "@/lib/providers";

const result = await useReason({
  model: deepseek("deepseek-chat"),
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

DeepSeek currently maps these generic Kortyx options:

- `temperature`
- `streaming`
- `maxOutputTokens`
- `stopSequences`
- `abortSignal`
- `reasoning.effort`
- `reasoning.maxTokens`
- `responseFormat.type`

Current DeepSeek provider options:

- `providerOptions.deepseek.thinking`

Current mapping details:

- `responseFormat.type: "json"` maps to DeepSeek JSON object mode
- `reasoning.effort` and `reasoning.maxTokens` map to enabling or disabling provider thinking
- `temperature` defaults to `0.7` when you do not set it

Current warning-backed gaps:

- `responseFormat.schema` is not sent as a native provider schema; it is included in instructions
- DeepSeek does not expose a generic reasoning token budget through this provider
- unknown `providerOptions` keys are ignored and reported in `result.warnings`

## 10. Normalized metadata you get back

DeepSeek returns the normalized Kortyx result fields when the API provides them:

- `usage`
- `finishReason`
- `providerMetadata`
- `warnings`
- `raw`

DeepSeek-specific metadata currently includes fields such as:

- `providerId`
- `modelId`
- `responseId`
- `responseModel`
- `created`
- `usage`
- `promptCacheHitTokens`
- `promptCacheMissTokens`

Use `providerMetadata` when you need debugging or observability details without coupling your app code to the raw provider payload shape.

## Supported scope

`@kortyx/deepseek` currently supports text generation through DeepSeek chat completions via `useReason(...)`, including streaming and non-streaming invocation.

It does not currently expose embeddings, image generation, file APIs, or provider-hosted tools. Check `result.warnings` when you rely on advanced generic options and want to verify how DeepSeek handled them.

## Available built-in DeepSeek model ids

- `deepseek-chat`
- `deepseek-reasoner`

## Next steps

- See [Hooks](../02-core-concepts/07-hooks.md) for `useReason(...)` behavior and structured output
- See [Provider API](../05-reference/04-provider-api.md) for the shared normalized provider contract
