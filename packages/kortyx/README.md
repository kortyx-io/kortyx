# kortyx

[![npm version](https://img.shields.io/npm/v/kortyx.svg)](https://www.npmjs.com/package/kortyx)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/kortyx.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D22-339933.svg)](https://github.com/kortyx-io/kortyx/blob/main/package.json)

**Kortyx is a TypeScript framework for building production AI agents with explicit workflows, provider-agnostic models, typed hooks, streaming, interrupts, and runtime persistence.**

Use `kortyx` as the main package. It re-exports the public server/runtime APIs from the supporting `@kortyx/*` packages so application code can stay focused on workflows, nodes, providers, and UI transport.

## Install

```bash
pnpm add kortyx @kortyx/google @kortyx/react
```

```bash
npm install kortyx @kortyx/google @kortyx/react
```

## Quickstart

Create a workflow:

```ts
// src/workflows/general-chat.workflow.ts
import { defineWorkflow } from "kortyx";
import { chatNode } from "@/nodes/chat.node";

export const generalChatWorkflow = defineWorkflow({
  id: "general-chat",
  version: "1.0.0",
  description: "Single-node chat workflow.",
  nodes: {
    chat: {
      run: chatNode,
      params: {
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

Add a server-side node:

```ts
// src/nodes/chat.node.ts
import { google } from "@kortyx/google";
import { useReason } from "kortyx";

type ChatParams = {
  temperature?: number;
};

export const chatNode = async ({
  input,
  params,
}: {
  input: unknown;
  params: ChatParams;
}) => {
  const result = await useReason({
    id: "chat",
    model: google("gemini-2.5-flash"),
    system: "You are a concise assistant.",
    input: String(input ?? ""),
    temperature: params.temperature ?? 0.3,
    stream: true,
    emit: true,
  });

  return {
    data: { text: result.text },
  };
};
```

Wire the agent:

```ts
// src/lib/agent.ts
import { createAgent } from "kortyx";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";

export const agent = createAgent({
  workflows: [generalChatWorkflow],
  defaultWorkflowId: "general-chat",
});
```

Expose it through a Next.js API route:

```ts
import { createChatRouteHandler } from "kortyx";
import { agent } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handleChat = createChatRouteHandler({ agent });

export async function POST(request: Request): Promise<Response> {
  return handleChat(request);
}
```

Consume the stream from React:

```tsx
"use client";

import { createRouteChatTransport, useChat } from "@kortyx/react";

export function Chat() {
  const chat = useChat({
    transport: createRouteChatTransport({ endpoint: "/api/chat" }),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        chat.send(String(form.get("message") ?? ""));
        event.currentTarget.reset();
      }}
    >
      {chat.messages.map((message) => (
        <p key={message.id}>{message.content}</p>
      ))}
      {chat.streamContentPieces.map((piece) =>
        piece.type === "text" ? (
          <span key={piece.id}>{piece.content}</span>
        ) : null,
      )}
      <input name="message" />
      <button type="submit" disabled={chat.isStreaming}>
        Send
      </button>
    </form>
  );
}
```

Set a provider key and run your app:

```bash
GOOGLE_API_KEY=your_key_here pnpm dev
```

## API Groups

| Area | Exports |
| --- | --- |
| Agent | `createAgent`, `createChatRouteHandler`, `streamChatFromRoute` |
| Workflows | `defineWorkflow`, `loadWorkflow`, `validateWorkflow` |
| Hooks | `useReason`, `useInterrupt`, `useStructuredData`, `useNodeState`, `useWorkflowState`, `useRuntimeContext` |
| Runtime | workflow registries, node registry, in-memory/Redis framework adapters |
| Providers | provider contracts and registry helpers from `@kortyx/providers` |
| Streams | SSE helpers, stream readers, collectors, structured reducers |

## Provider Packages

Install only the provider integrations your app needs.

| Provider | Package | Factory | Default environment variable |
| --- | --- | --- | --- |
| Google Gemini | `@kortyx/google` | `google(...)` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| OpenAI | `@kortyx/openai` | `openai(...)` | `OPENAI_API_KEY` |
| Anthropic | `@kortyx/anthropic` | `anthropic(...)` | `ANTHROPIC_API_KEY` |
| DeepSeek | `@kortyx/deepseek` | `deepseek(...)` | `DEEPSEEK_API_KEY` |
| Groq | `@kortyx/groq` | `groq(...)` | `GROQ_API_KEY` |
| Mistral | `@kortyx/mistral` | `mistral(...)` | `MISTRAL_API_KEY` |

## Documentation

- [Monorepo](https://github.com/kortyx-io/kortyx)
- [Documentation](https://kortyx.io/docs)
- [Package overview](https://kortyx.io/docs/reference/package-overview)
- [Quickstart: Next.js API Route](https://kortyx.io/docs/getting-started/quickstart-nextjs)
- [Runtime persistence](https://kortyx.io/docs/production/persistence)
- [Provider guide](https://kortyx.io/docs/kortyx-providers/choose-a-provider)

## Studio

Kortyx Studio is on the way for cost tracking, logs, observability, prompt tracking, and operational review.

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
