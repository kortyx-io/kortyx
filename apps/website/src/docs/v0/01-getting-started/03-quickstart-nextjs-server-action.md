---
id: v0-quickstart-nextjs-server-action
title: "Quickstart (Next.js Server Action)"
description: "Build a working Next.js chat flow using server actions, Kortyx workflows, and node-level model wiring with buffered chunk handling."
keywords: [kortyx, nextjs, quickstart, server-actions, buffered, chunks]
sidebar_label: "Quickstart (Next.js Server Action)"
---
# Quickstart (Next.js Server Action)

This quickstart matches the current OSS implementation and mirrors `examples/kortyx-nextjs-chat-server-action`.

> **Good to know:** As of Next.js 16.1.6 (March 8, 2026), Server Actions return after completion and do not stream chunk updates to client UI in real time. For live token/chunk rendering, use [Quickstart (Next.js API Route)](./02-quickstart-nextjs.md).

## 1. Create a workflow

```ts
// src/workflows/general-chat.workflow.ts
import { defineWorkflow } from "kortyx";
import { google } from "@/lib/providers";
import { chatNode } from "@/nodes/chat.node";

export const generalChatWorkflow = defineWorkflow({
  id: "general-chat",
  version: "1.0.0",
  description: "Single-node chat workflow",
  nodes: {
    chat: {
      run: chatNode,
      params: {
        model: google("gemini-2.5-flash"),
        temperature: 0.3,
      },
    },
  },
  edges: [
    ["__start__", "chat"],
    ["chat", "__end__"],
  ],
});
```

```js
// src/workflows/general-chat.workflow.js
import { defineWorkflow } from "kortyx";
import { google } from "@/lib/providers";
import { chatNode } from "@/nodes/chat.node";

export const generalChatWorkflow = defineWorkflow({
  id: "general-chat",
  version: "1.0.0",
  description: "Single-node chat workflow",
  nodes: {
    chat: {
      run: chatNode,
      params: {
        model: google("gemini-2.5-flash"),
        temperature: 0.3,
      },
    },
  },
  edges: [
    ["__start__", "chat"],
    ["chat", "__end__"],
  ],
});
```

## 2. Initialize provider bootstrap

```ts
// src/lib/providers.ts
import { createGoogleGenerativeAI } from "@kortyx/google";

const googleApiKey = process.env.GOOGLE_API_KEY;
if (!googleApiKey) {
  throw new Error("Google provider requires an API key. Set GOOGLE_API_KEY.");
}

export const google = createGoogleGenerativeAI({ apiKey: googleApiKey });
```

```js
// src/lib/providers.js
import { createGoogleGenerativeAI } from "@kortyx/google";

const googleApiKey = process.env.GOOGLE_API_KEY;
if (!googleApiKey) {
  throw new Error("Google provider requires an API key. Set GOOGLE_API_KEY.");
}

export const google = createGoogleGenerativeAI({ apiKey: googleApiKey });
```

## 3. Create a node

```ts
// src/nodes/chat.node.ts
import type { ProviderModelRef } from "kortyx";
import { useReason } from "kortyx";
import { google } from "@/lib/providers";

export type ChatNodeParams = {
  model?: ProviderModelRef;
  temperature?: number;
  system?: string;
};

export const chatNode = async ({
  input,
  params,
}: {
  input: unknown;
  params: ChatNodeParams;
}) => {
  const {
    model = google("gemini-2.5-flash"),
    temperature = 0.3,
    system = "",
  } = params;

  const res = await useReason({
    model,
    system: system || "You are a concise assistant.",
    input: String(input ?? ""),
    temperature,
    emit: true, // publish text events
    stream: true, // token-by-token output
  });

  return {
    data: { text: res.text },
    ui: { message: res.text },
  };
};
```

```js
// src/nodes/chat.node.js
import { useReason } from "kortyx";
import { google } from "@/lib/providers";

export const chatNode = async ({ input, params }) => {
  const {
    model = google("gemini-2.5-flash"),
    temperature = 0.3,
    system = "",
  } = params ?? {};

  const res = await useReason({
    model,
    system: system || "You are a concise assistant.",
    input: String(input ?? ""),
    temperature,
    emit: true, // publish text events
    stream: true, // token-by-token output
  });

  return {
    data: { text: res.text },
    ui: { message: res.text },
  };
};
```

## 4. Wire an agent

```ts
// src/lib/kortyx-client.ts
import { createAgent } from "kortyx";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";

export const agent = createAgent({
  workflows: [generalChatWorkflow],
  session: {
    id: "anonymous-session",
  },
  fallbackWorkflowId: "general-chat",
});
```

```js
// src/lib/kortyx-client.js
import { createAgent } from "kortyx";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";

export const agent = createAgent({
  workflows: [generalChatWorkflow],
  session: {
    id: "anonymous-session",
  },
  fallbackWorkflowId: "general-chat",
});
```

## 5. Call `processChat`

```ts
// src/app/actions/chat.ts
"use server";

import { consumeStream, readStream, type StreamChunk } from "kortyx";
import { agent } from "@/lib/kortyx-client";

export async function runChat(args: {
  sessionId: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}): Promise<StreamChunk[]> {
  const response = await agent.processChat(args.messages, {
    sessionId: args.sessionId,
  });

  const chunks: StreamChunk[] = [];
  await consumeStream(readStream(response.body), {
    onChunk: (chunk) => {
      chunks.push(chunk);
    },
  });
  return chunks;
}
```

```js
// src/app/actions/chat.js
"use server";

import { consumeStream, readStream } from "kortyx";
import { agent } from "@/lib/kortyx-client";

export async function runChat(args) {
  const response = await agent.processChat(args.messages, {
    sessionId: args.sessionId,
  });

  const chunks = [];
  await consumeStream(readStream(response.body), {
    onChunk: (chunk) => {
      chunks.push(chunk);
    },
  });
  return chunks;
}
```

## 6. Run

```bash tabs="run-dev" tab="pnpm"
GOOGLE_API_KEY=your_key_here pnpm dev
```

```bash tabs="run-dev" tab="npm"
GOOGLE_API_KEY=your_key_here npm run dev
```

```bash tabs="run-dev" tab="yarn"
GOOGLE_API_KEY=your_key_here yarn dev
```

```bash tabs="run-dev" tab="bun"
GOOGLE_API_KEY=your_key_here bun run dev
```

## What this gives you

- Type-safe workflow definition
- Explicit provider bootstrap at app level
- Node-level model control via `useReason(...)`
- Buffered chunk collection through a Server Action return value
- Chunk event types in the buffered result (`text-start`, `text-delta`, `text-end`, `message`, `done`)
- Built-in interrupt/resume path when your nodes use `useInterrupt`

Next:

- [Hooks](../02-core-concepts/06-hooks.md)
- [Interrupts and Resume](../03-guides/02-interrupts-and-resume.md)
