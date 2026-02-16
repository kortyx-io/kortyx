---
id: v0-setup-google-provider
title: "Setup (Google)"
description: "Install and use the Google provider package with strict createAgent config."
keywords: [kortyx, google, gemini, provider-setup, getProvider]
sidebar_label: "Setup (Google)"
---
# Setup (Google)

Google provider support lives in a dedicated package.

## 1. Install provider package

```bash
npm install @kortyx/google
```

## 2. Use declarative `createAgent`

```ts
import { createAgent } from "kortyx";

const agent = createAgent({
  workflows: [generalChatWorkflow],
  ai: {
    provider: "google",
    apiKey: process.env.GOOGLE_API_KEY,
  },
});
```

## 3. Use inside nodes via `useAiProvider`

```ts
import { useAiProvider } from "kortyx";

const llm = useAiProvider("google:gemini-2.5-flash");
const res = await llm.call({ prompt: "Hello" });
```

## Available built-in Google model ids

- `gemini-2.5-flash`
- `gemini-2.0-flash`
- `gemini-1.5-pro`
- `gemini-1.5-flash`
