---
id: v0-quickstart-nextjs
title: "Quickstart (Next.js)"
description: "Build a working Next.js chat flow using Kortyx workflows, nodes, agent setup, and streaming."
keywords: [kortyx, nextjs, quickstart, server-actions, streaming]
sidebar_label: "Quickstart (Next.js)"
---
# Quickstart (Next.js Server Action)

This quickstart matches the current OSS implementation and mirrors `examples/kortyx-nextjs-chat`.

## 1. Create a workflow

```ts
// src/workflows/general-chat.workflow.ts
import { defineWorkflow } from "kortyx";
import { chatNode } from "@/nodes/chat.node";

export const generalChatWorkflow = defineWorkflow({
  id: "general-chat",
  version: "1.0.0",
  description: "Single-node chat workflow",
  nodes: {
    chat: {
      run: chatNode,
      params: {
        model: "google:gemini-2.5-flash",
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

## 2. Create a node

```ts
// src/nodes/chat.node.ts
import { useAiProvider } from "kortyx";

export const chatNode = async ({ input, params }: { input: unknown; params: { model?: string; temperature?: number } }) => {
  const model = useAiProvider(params.model ?? "google:gemini-2.5-flash");

  const res = await model.call({
    prompt: String(input ?? ""),
    temperature: params.temperature ?? 0.3,
    system: "You are a concise assistant.",
  });

  return {
    data: { text: res.text },
    ui: { message: res.text },
  };
};
```

## 3. Wire an agent

```ts
// src/lib/kortyx-client.ts
import { createAgent } from "kortyx";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";

export const agent = createAgent({
  workflows: [generalChatWorkflow],
  ai: {
    provider: "google",
    apiKey:
      process.env.GOOGLE_API_KEY ??
      process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
      process.env.KORTYX_GOOGLE_API_KEY ??
      process.env.KORTYX_GEMINI_API_KEY,
  },
  session: {
    id: "anonymous-session",
  },
  fallbackWorkflowId: "general-chat",
});
```

## 4. Call `processChat`

```ts
// src/app/actions/chat.ts
"use server";

import { readStream, type StreamChunk } from "kortyx";
import { agent } from "@/lib/kortyx-client";

export async function runChat(args: {
  sessionId: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}): Promise<StreamChunk[]> {
  const response = await agent.processChat(args.messages, {
    sessionId: args.sessionId,
  });

  const chunks: StreamChunk[] = [];
  for await (const chunk of readStream(response.body)) {
    chunks.push(chunk);
  }
  return chunks;
}
```

## 5. Run

```bash
GOOGLE_API_KEY=your_key_here pnpm dev
```

## What this gives you

- Type-safe workflow definition
- Streaming chunks (`text-start`, `text-delta`, `text-end`, `message`, `done`)
- Built-in interrupt/resume path when your nodes use `useAiInterrupt`

Next:

- [Hooks](../03-runtime/01-hooks.md)
- [Interrupts and Resume](../03-runtime/02-interrupts-and-resume.md)
