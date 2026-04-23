---
id: v0-react-client
title: "React Client (@kortyx/react)"
description: "Reference the React client helpers for streamed chat, structured streams, transport, and storage."
keywords:
  [kortyx, react, useChat, useStructuredStreams, createRouteChatTransport]
sidebar_label: "React Client"
---
# React Client (`@kortyx/react`)

`@kortyx/react` is the recommended client entry for React apps consuming streamed chat responses.

Start here when you want:

- `useChat(...)` for batteries-included streamed chat state
- `useStructuredStreams()` for custom React UIs without the full chat abstraction
- route/server-action transport helpers
- default browser storage for chat history

Use `kortyx/browser` only when you want raw stream readers or the low-level structured reducer outside React.

## Recommended path: `useChat(...)`

For most React apps, `useChat(...)` should be the first stop.

```ts
import { createRouteChatTransport, useChat } from "@kortyx/react";

export function ChatPage() {
  const chat = useChat({
    transport: createRouteChatTransport({
      endpoint: "/api/chat",
      getBody: ({ sessionId, workflowId, messages }) => ({
        sessionId,
        workflowId,
        messages,
      }),
    }),
  });

  return <ChatWindow chat={chat} />;
}
```
```js
import { createRouteChatTransport, useChat } from "@kortyx/react";

export function ChatPage() {
  const chat = useChat({
    transport: createRouteChatTransport({
      endpoint: "/api/chat",
      getBody: ({ sessionId, workflowId, messages }) => ({
        sessionId,
        workflowId,
        messages,
      }),
    }),
  });

  return <ChatWindow chat={chat} />;
}
```

`useChat(...)` owns:

- finalized `messages`
- live `streamContentPieces`
- `isStreaming`
- interrupt resume handling
- structured stream accumulation
- default browser storage unless you override it

## `useChat(...)` options

```ts
import type { ChatStorage, ChatTransport } from "@kortyx/react";

type UseChatOptions = {
  transport: ChatTransport;
  storage?: ChatStorage;
  createId?: () => string;
};
```

Notes:

- `transport` is required
- `storage` defaults to browser storage
- `createId` is optional when you want custom message/piece ids

## Transport helpers

### API route / SSE transport

```ts
import { createRouteChatTransport } from "@kortyx/react";

const transport = createRouteChatTransport({
  endpoint: "/api/chat",
  getBody: ({ sessionId, workflowId, messages }) => ({
    sessionId,
    workflowId,
    messages,
  }),
});
```
```js
import { createRouteChatTransport } from "@kortyx/react";

const transport = createRouteChatTransport({
  endpoint: "/api/chat",
  getBody: ({ sessionId, workflowId, messages }) => ({
    sessionId,
    workflowId,
    messages,
  }),
});
```

Use this when your backend returns SSE chunks from a route handler.

### Custom transport

If your app does not use an SSE route, provide your own transport.

```ts
import { createChatTransport } from "@kortyx/react";

const transport = createChatTransport({
  stream: ({ sessionId, workflowId, messages }) =>
    runChat({
      sessionId,
      workflowId,
      messages,
    }),
});
```
```js
import { createChatTransport } from "@kortyx/react";

const transport = createChatTransport({
  stream: ({ sessionId, workflowId, messages }) =>
    runChat({
      sessionId,
      workflowId,
      messages,
    }),
});
```

Use this when you already have an app-specific function that returns chunks.

## Storage

By default, `useChat(...)` uses browser storage.

If you want to provide storage explicitly:

```ts
import { createBrowserChatStorage } from "@kortyx/react";

const storage = createBrowserChatStorage();
```
```js
import { createBrowserChatStorage } from "@kortyx/react";

const storage = createBrowserChatStorage();
```

You can also provide your own `ChatStorage` implementation for app APIs, databases, or hybrid sync strategies.

```ts
import type { ChatStorage } from "@kortyx/react";

const storage: ChatStorage = {
  async load() {
    return {};
  },
  async save(state) {
    await fetch("/api/chat-state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state),
    });
  },
  async clearMessages() {
    await fetch("/api/chat-state/messages", {
      method: "DELETE",
    });
  },
};
```

## Custom React UI: `useStructuredStreams()`

If you want structured stream state without the full chat abstraction, use `useStructuredStreams()`.

```ts
import { useStructuredStreams } from "@kortyx/react";
import { readStream } from "kortyx/browser";

export function StructuredPanel() {
  const structured = useStructuredStreams<Record<string, unknown>>();

  async function load() {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    for await (const chunk of readStream(response.body)) {
      structured.applyStreamChunk(chunk);

      if (chunk.type === "done") {
        break;
      }
    }
  }

  return null;
}
```
```js
import { useStructuredStreams } from "@kortyx/react";
import { readStream } from "kortyx/browser";

export function StructuredPanel() {
  const structured = useStructuredStreams();

  async function load() {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    for await (const chunk of readStream(response.body)) {
      structured.applyStreamChunk(chunk);

      if (chunk.type === "done") {
        break;
      }
    }
  }

  return null;
}
```

That gives you:

- `items`: stable ordered structured pieces
- `byStreamId`: record-style access
- `get(streamId)`: direct lookup
- `clear()`: reset between runs

## When to drop to `kortyx/browser`

Use `kortyx/browser` when:

- you are not using React
- you want raw `readStream(...)` / `consumeStream(...)`
- you want the low-level `applyStructuredChunk(...)` reducer directly

```ts
import { applyStructuredChunk, readStream } from "kortyx/browser";
```

That path is lower-level by design. React apps should usually start with `@kortyx/react` and only drop down when they need custom wiring.
