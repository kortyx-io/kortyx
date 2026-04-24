---
id: v0-google-generative-ai-provider
title: "Google Generative AI Provider"
description: "Install and configure the Google Generative AI provider package for Kortyx, from basic direct usage to shared app entrypoints and advanced custom setup."
keywords: [kortyx, google, gemini, provider, google-generative-ai]
sidebar_label: "Google Generative AI"
---
# Google Generative AI Provider

Google provider support lives in a dedicated package.

## 1. Install provider package

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

## 2. Basic usage

```ts
import { google } from "@kortyx/google";

const model = google("gemini-2.5-flash");
```

```js
import { google } from "@kortyx/google";

const model = google("gemini-2.5-flash");
```

> **Good to know:** The default `google` export reads `GOOGLE_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `KORTYX_GOOGLE_API_KEY`, or `KORTYX_GEMINI_API_KEY` on first use.

## 3. App entrypoint usage

If you want a shared app import such as `@/lib/providers`, re-export `google` from a bootstrap file:

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

> **Good to know:** `export { google } from "@kortyx/google"` is a re-export only. It does not create a local `google` binding in the same file. If you want to call `google("...")` in that file, use `import { google } from "@kortyx/google"`.

## 4. Advanced usage

If you want explicit app-owned setup or custom settings, use the factory:

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

## 5. Use model refs in workflow/node params

```ts
// workflow params
params: {
  model: google("gemini-2.5-flash"),
  temperature: 0.3,
}
```

```js
// workflow params
params: {
  model: google("gemini-2.5-flash"),
  temperature: 0.3,
}
```

## 6. Call the model from nodes with `useReason(...)`

```ts
import { useReason } from "kortyx";

const result = await useReason({
  model: params.model,
  input: String(input ?? ""),
  temperature: params.temperature ?? 0.3,
  emit: true, // publish text events
  stream: true, // token-by-token output
});
```

```js
import { useReason } from "kortyx";

const result = await useReason({
  model: params.model,
  input: String(input ?? ""),
  temperature: params.temperature ?? 0.3,
  emit: true, // publish text events
  stream: true, // token-by-token output
});
```

> **Good to know:** You do not configure providers on `createAgent`. Models are selected at node/workflow level, whether you use the default `google` export or an explicit factory-created provider.

## Available built-in Google model ids

- `gemini-2.5-flash`
- `gemini-2.0-flash`
- `gemini-1.5-pro`
- `gemini-1.5-flash`
