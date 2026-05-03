---
id: v0-mistral-provider
title: "Mistral Provider"
description: "Use Mistral models in Kortyx with the batteries-included mistral export or an explicit provider instance."
keywords: [kortyx, mistral, provider, magistral, pixtral]
sidebar_label: "Mistral"
---
# Mistral Provider

`@kortyx/mistral` is the Mistral provider package for Kortyx.

It gives you two entry points:

- `mistral`: a batteries-included default provider selector
- `createMistral(...)`: an explicit factory for custom setup

## 1. Install the package

```bash tabs="install-mistral-provider" tab="pnpm"
pnpm add @kortyx/mistral
```

```bash tabs="install-mistral-provider" tab="npm"
npm install @kortyx/mistral
```

```bash tabs="install-mistral-provider" tab="yarn"
yarn add @kortyx/mistral
```

```bash tabs="install-mistral-provider" tab="bun"
bun add @kortyx/mistral
```

## 2. What the package exports

```ts
import {
  MODELS,
  PROVIDER_ID,
  createMistral,
  mistral,
} from "@kortyx/mistral";
```

```js
import {
  MODELS,
  PROVIDER_ID,
  createMistral,
  mistral,
} from "@kortyx/mistral";
```

What each export is for:

- `mistral`: default provider selector for the fastest start
- `createMistral(...)`: custom provider instance with explicit settings
- `MODELS`: built-in Mistral model ids exposed by the package
- `PROVIDER_ID`: the provider id string, currently `"mistral"`

## 3. Basic usage in the same file

```ts
import { mistral } from "@kortyx/mistral";

const model = mistral("mistral-large-latest");
```

```js
import { mistral } from "@kortyx/mistral";

const model = mistral("mistral-large-latest");
```

`mistral` is a provider selector, which means:

- it is callable: `mistral("mistral-large-latest")`
- it also exposes provider metadata: `mistral.id`, `mistral.models`

```ts
mistral.id; // "mistral"
mistral.models; // readonly list of built-in model ids
```

```js
mistral.id; // "mistral"
mistral.models; // readonly list of built-in model ids
```

> **Good to know:** The built-in model list gives autocomplete, but arbitrary Mistral model ids are accepted as strings.

## 4. Shared app bootstrap usage

If you want one shared import path across your app, re-export `mistral` from a bootstrap file such as `src/lib/providers.ts`.

```ts
// src/lib/providers.ts
export { mistral } from "@kortyx/mistral";
```

```js
// src/lib/providers.js
export { mistral } from "@kortyx/mistral";
```

Then import it from that file where you actually use it:

```ts
// src/nodes/chat.node.ts
import { mistral } from "@/lib/providers";
```

```js
// src/nodes/chat.node.js
import { mistral } from "@/lib/providers";
```

## 5. Advanced usage with explicit settings

Use `createMistral(...)` when you want app-owned configuration instead of the default environment-based setup.

```ts
import { createMistral } from "@kortyx/mistral";

export const mistral = createMistral({
  apiKey: process.env.MISTRAL_API_KEY,
});
```

```js
import { createMistral } from "@kortyx/mistral";

export const mistral = createMistral({
  apiKey: process.env.MISTRAL_API_KEY,
});
```

Use the factory when you need to:

- pass `apiKey` explicitly
- use a custom `baseUrl`
- provide a custom `fetch`

## 6. Credentials and first-use behavior

The default `mistral` export resolves credentials on first use, not at import time.

Supported environment variables:

- `MISTRAL_API_KEY`
- `KORTYX_MISTRAL_API_KEY`

If neither variable is set and you did not pass `apiKey` to `createMistral(...)`, the provider throws a configuration error the first time a Mistral model is actually used.

## 7. Create model refs for workflow and node params

```ts
params: {
  model: mistral("mistral-large-latest"),
  temperature: 0.3,
}
```

```js
params: {
  model: mistral("mistral-large-latest"),
  temperature: 0.3,
}
```

You can also attach default model options to the ref itself:

```ts
const model = mistral("mistral-small-latest", {
  providerOptions: {
    mistral: {
      safePrompt: true,
      reasoningEffort: "high",
    },
  },
});
```

```js
const model = mistral("mistral-small-latest", {
  providerOptions: {
    mistral: {
      safePrompt: true,
      reasoningEffort: "high",
    },
  },
});
```

Those become default options for later `useReason(...)` calls unless you override them at call time.

## 8. Use the model with `useReason(...)`

```ts
import { useReason } from "kortyx";
import { mistral } from "@/lib/providers";

const result = await useReason({
  model: mistral("mistral-large-latest"),
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
import { mistral } from "@/lib/providers";

const result = await useReason({
  model: mistral("mistral-large-latest"),
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

Mistral currently maps these generic Kortyx options:

- `temperature`
- `streaming`
- `maxOutputTokens`
- `abortSignal`
- `reasoning.effort`
- `reasoning.maxTokens`
- `reasoning.includeThoughts`
- `responseFormat.type`
- `responseFormat.schema`

Current Mistral provider options:

- `providerOptions.mistral.safePrompt`
- `providerOptions.mistral.structuredOutputs`
- `providerOptions.mistral.strictJsonSchema`
- `providerOptions.mistral.reasoningEffort`
- `providerOptions.mistral.topP`
- `providerOptions.mistral.randomSeed`

Current mapping details:

- `responseFormat.type: "json"` maps to Mistral JSON mode
- `responseFormat.schema` maps to Mistral JSON schema output unless `structuredOutputs` is `false`
- `safePrompt` maps to Mistral `safe_prompt`
- `reasoningEffort` maps only for `mistral-small-latest` and `mistral-small-2603`

Current warning-backed gaps:

- `stopSequences` is currently reported as unsupported and not sent
- reasoning options on unsupported models are reported in `result.warnings`
- unknown `providerOptions` keys are ignored and reported in `result.warnings`

## 10. Normalized metadata you get back

Mistral returns the normalized Kortyx result fields when the API provides them:

- `usage`
- `finishReason`
- `providerMetadata`
- `warnings`
- `raw`

Mistral-specific metadata currently includes fields such as:

- `providerId`
- `modelId`
- `responseId`
- `responseModel`
- `created`
- `usage`

Use `providerMetadata` when you need debugging or observability details without coupling your app code to the raw provider payload shape.

## Supported scope

`@kortyx/mistral` currently supports text generation through Mistral chat completions via `useReason(...)`, including streaming and non-streaming invocation.

It does not currently expose Mistral embeddings, OCR/document APIs, file APIs, or provider-hosted tools. Check `result.warnings` when you rely on advanced generic options and want to verify how Mistral handled them.

## Available built-in Mistral model ids

- `ministral-3b-latest`
- `ministral-8b-latest`
- `ministral-14b-latest`
- `mistral-large-latest`
- `mistral-medium-latest`
- `mistral-large-2512`
- `mistral-medium-2508`
- `mistral-medium-2505`
- `mistral-small-2506`
- `mistral-small-latest`
- `mistral-small-2603`
- `magistral-medium-latest`
- `magistral-small-latest`
- `magistral-medium-2509`
- `magistral-small-2509`
- `pixtral-large-latest`

## Next steps

- See [Hooks](../02-core-concepts/07-hooks.md) for `useReason(...)` behavior and structured output
- See [Provider API](../05-reference/04-provider-api.md) for the shared normalized provider contract
