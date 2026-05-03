---
id: v0-google-generative-ai-provider
title: "Google Generative AI Provider"
description: "Use Google's Gemini models in Kortyx with the batteries-included google export or an explicit provider instance."
keywords: [kortyx, google, gemini, provider, google-generative-ai]
sidebar_label: "Google Generative AI"
---
# Google Generative AI Provider

`@kortyx/google` is the Google Gemini provider package for Kortyx.

It gives you two entry points:

- `google`: a batteries-included default provider selector
- `createGoogleGenerativeAI(...)`: an explicit factory for custom setup

## 1. Install the package

```bash tabs="install-google-provider" tab="pnpm"
pnpm add @kortyx/google
```

```bash tabs="install-google-provider" tab="npm"
npm install @kortyx/google
```

```bash tabs="install-google-provider" tab="yarn"
yarn add @kortyx/google
```

```bash tabs="install-google-provider" tab="bun"
bun add @kortyx/google
```

## 2. What the package exports

```ts
import {
  MODELS,
  PROVIDER_ID,
  createGoogleGenerativeAI,
  google,
} from "@kortyx/google";
```

```js
import {
  MODELS,
  PROVIDER_ID,
  createGoogleGenerativeAI,
  google,
} from "@kortyx/google";
```

What each export is for:

- `google`: default provider selector for the fastest start
- `createGoogleGenerativeAI(...)`: custom provider instance with explicit settings
- `MODELS`: built-in Google model ids exposed by the package
- `PROVIDER_ID`: the provider id string, currently `"google"`

## 3. Basic usage in the same file

If you want to use Google directly in the file where you call `useReason(...)`, import `google` and call it there.

```ts
import { google } from "@kortyx/google";

const model = google("gemini-2.5-flash");
```

```js
import { google } from "@kortyx/google";

const model = google("gemini-2.5-flash");
```

`google` is a provider selector, which means:

- it is callable: `google("gemini-2.5-flash")`
- it also exposes provider metadata: `google.id`, `google.models`

```ts
google.id; // "google"
google.models; // readonly list of model ids
```

```js
google.id; // "google"
google.models; // readonly list of model ids
```

> **Good to know:** `google("gemini-2.5-flash")` returns a model ref, not a live API client call. The actual provider-native model is resolved later when Kortyx executes `useReason(...)`.

## 4. Shared app bootstrap usage

If you want one shared import path across your app, re-export `google` from a bootstrap file such as `src/lib/providers.ts`.

```ts
// src/lib/providers.ts
export { google } from "@kortyx/google";
```

```js
// src/lib/providers.js
export { google } from "@kortyx/google";
```

Then import it from that file where you actually use it:

```ts
// src/nodes/chat.node.ts
import { google } from "@/lib/providers";
```

```js
// src/nodes/chat.node.js
import { google } from "@/lib/providers";
```

> **Good to know:** `export { google } from "@kortyx/google"` is only a re-export. It does not create a local `google` variable in the same file. If you want to call `google("...")` in that same file, import it normally.

## 5. Advanced usage with explicit settings

Use `createGoogleGenerativeAI(...)` when you want app-owned configuration instead of the default environment-based setup.

```ts
import { createGoogleGenerativeAI } from "@kortyx/google";

export const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});
```

```js
import { createGoogleGenerativeAI } from "@kortyx/google";

export const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});
```

Use the factory when you need to:

- pass `apiKey` explicitly
- use a custom `baseUrl`
- provide a custom `fetch`

## 6. Credentials and first-use behavior

The default `google` export resolves credentials on first use, not at import time.

Supported environment variables:

- `GOOGLE_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `KORTYX_GOOGLE_API_KEY`
- `KORTYX_GEMINI_API_KEY`

If none of them are set and you did not pass `apiKey` to `createGoogleGenerativeAI(...)`, the provider throws a configuration error the first time a Google model is actually used.

## 7. Create model refs for workflow and node params

You can pass model refs through workflow or node params just like any other value.

```ts
params: {
  model: google("gemini-2.5-flash"),
  temperature: 0.3,
}
```

```js
params: {
  model: google("gemini-2.5-flash"),
  temperature: 0.3,
}
```

You can also attach default model options to the ref itself:

```ts
const model = google("gemini-2.5-flash", {
  temperature: 0.2,
  maxOutputTokens: 800,
});
```

```js
const model = google("gemini-2.5-flash", {
  temperature: 0.2,
  maxOutputTokens: 800,
});
```

Those become default options for later `useReason(...)` calls unless you override them at call time.

## 8. Use the model with `useReason(...)`

```ts
import { useReason } from "kortyx";
import { google } from "@/lib/providers";

const result = await useReason({
  model: google("gemini-2.5-flash"),
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
import { google } from "@/lib/providers";

const result = await useReason({
  model: google("gemini-2.5-flash"),
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

Google currently maps these generic Kortyx options:

- `temperature`
- `streaming`
- `maxOutputTokens`
- `stopSequences`
- `abortSignal`
- `reasoning.effort`
- `reasoning.maxTokens`
- `reasoning.includeThoughts`
- `responseFormat.type`

Current Google mapping details:

- `responseFormat.type: "json"` sets the Google response MIME type to JSON
- `responseFormat.type: "text"` sets the Google response MIME type to plain text
- `reasoning.*` maps to Google thinking configuration

Current warning-backed gaps:

- `responseFormat.schema` is not yet translated into Google `responseSchema`
- `providerOptions` is not yet mapped into Google request fields
- unsupported `reasoning.effort` values fall back to `"medium"` and add a compatibility warning

That means you should check `result.warnings` if you are relying on advanced generic options and want to confirm how the provider handled them.

## 10. Normalized metadata you get back

Google returns the normalized Kortyx result fields when the API provides them:

- `usage`
- `finishReason`
- `providerMetadata`
- `warnings`
- `raw`

Google-specific metadata currently includes fields such as:

- `providerId`
- `modelId`
- `responseId`
- `modelVersion`
- `promptFeedback`
- `usageMetadata`

Use `providerMetadata` when you need debugging or observability details without coupling your app code to the raw provider payload shape.

## Supported scope

`@kortyx/google` currently supports text generation through `useReason(...)`, including streaming and non-streaming invocation.

It does not currently expose provider-native embeddings, image generation, file APIs, Google-hosted tools, or multimodal output APIs. Check `result.warnings` when you rely on advanced generic options and want to verify how Google handled them.

## Available built-in Google model ids

- `gemini-2.5-flash`
- `gemini-2.0-flash`
- `gemini-1.5-pro`
- `gemini-1.5-flash`

## Next steps

- See [Hooks](../02-core-concepts/07-hooks.md) for `useReason(...)` behavior and structured output
- See [Provider API](../05-reference/04-provider-api.md) for the shared normalized provider contract
