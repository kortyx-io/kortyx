---
id: v0-quickstart-nextjs-api-route
title: "Quickstart (Next.js API Route)"
description: "Build a working Next.js chat flow using API routes, Kortyx workflows, node-level model wiring, and streaming."
keywords: [kortyx, nextjs, quickstart, api-route, streaming]
sidebar_label: "Quickstart (Next.js API Route)"
---
# Quickstart (Next.js API Route)

This quickstart matches the current OSS implementation and mirrors `examples/kortyx-nextjs-chat-api-route`.

> **Good to know:** Use this path when you need live token/chunk updates in the UI.

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
  defaultWorkflowId: "general-chat",
});
```

```js
// src/lib/kortyx-client.js
import { createAgent } from "kortyx";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";

export const agent = createAgent({
  workflows: [generalChatWorkflow],
  defaultWorkflowId: "general-chat",
});
```

## 5. Add an API route

```ts
// src/app/api/chat/route.ts
import { createChatRouteHandler } from "kortyx";
import { agent } from "@/lib/kortyx-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handleChat = createChatRouteHandler({ agent });

export async function POST(request: Request): Promise<Response> {
  return handleChat(request);
}
```

```js
// src/app/api/chat/route.js
import { createChatRouteHandler } from "kortyx";
import { agent } from "@/lib/kortyx-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handleChat = createChatRouteHandler({ agent });

export async function POST(request) {
  return handleChat(request);
}
```

> **Good to know:** Request body supports optional `stream` (default `true`). Send `{ stream: false }` to receive buffered JSON `{ chunks, text, structured }` instead of SSE. If you only want raw chunks, use `collectStream(...)` in a custom route.

## 6. Call `/api/chat` from client code

> **Good to know:** For live UI updates, consume chunks directly with `for await...of` instead of collecting all chunks into an array first.

```ts
// src/lib/chat-client.ts
import {
  consumeStream,
  streamChatFromRoute,
  type StreamChatFromRouteArgs,
} from "kortyx";

export function runChatStream(
  args: Omit<StreamChatFromRouteArgs, "endpoint">,
) {
  return streamChatFromRoute({
    endpoint: "/api/chat",
    ...args,
  });
}

export async function consumeChat(
  args: Omit<StreamChatFromRouteArgs, "endpoint">,
) {
  const stream = runChatStream(args);

  await consumeStream(stream, {
    onChunk: (chunk) => {
      // Update UI incrementally here.
      console.log(chunk.type);
    },
    onError: (err) => {
      console.error(err);
    },
  });
}
```

```js
// src/lib/chat-client.js
import { consumeStream, streamChatFromRoute } from "kortyx";

export function runChatStream(args) {
  return streamChatFromRoute({
    endpoint: "/api/chat",
    ...args,
  });
}

export async function consumeChat(args) {
  const stream = runChatStream(args);

  await consumeStream(stream, {
    onChunk: (chunk) => {
      // Update UI incrementally here.
      console.log(chunk.type);
    },
    onError: (err) => {
      console.error(err);
    },
  });
}
```

## 7. Run

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
- API-route transport with `streamChatFromRoute(...)`
- Callback-based stream consumption with `consumeStream(...)`
- Streaming chunks (`text-start`, `text-delta`, `text-end`, `message`, `done`)
- Built-in interrupt/resume path when your nodes use `useInterrupt`

Next:

- [Hooks](../02-core-concepts/07-hooks.md)
- [Interrupts and Resume](../03-guides/02-interrupts-and-resume.md)
