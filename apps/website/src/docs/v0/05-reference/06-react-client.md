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
    }),
  });

  return <ChatWindow chat={chat} />;
}
```

`useChat(...)` owns:

- finalized `messages`
- live `streamContentPieces`
- `isStreaming`
- `error` and `clearError()`
- `abort()` and `canAbort`
- interrupt resume handling
- structured stream accumulation
- default browser storage unless you override it

## Messages and active streams

`messages` contains finalized chat history only. While the assistant is still streaming, render the active assistant response from `streamContentPieces`.

This separation is intentional:

- persisted history does not change on every token
- active text, structured data, interrupts, and errors can render before finalization
- finalized assistant messages can keep their debug chunks after the stream ends

When a stream finishes, `useChat(...)` builds the assistant message and appends it to `messages`.

## Request context and message preparation

Pass `context` when the client should send non-message request data, such as a selected tenant id, visible thread id, or UI state needed by the server.

```ts
const chat = useChat({
  transport: createRouteChatTransport({
    endpoint: "/api/chat",
  }),
  context: {
    threadId,
    tenantId,
  },
});
```
```js
const chat = useChat({
  transport: createRouteChatTransport({
    endpoint: "/api/chat",
  }),
  context: {
    threadId,
    tenantId,
  },
});
```

By default, `useChat(...)` sends finalized history plus the outgoing user message. Use `prepareContextMessages` when your app owns a different history strategy, such as server-side history, summaries, or key facts.

```ts
const chat = useChat({
  transport: createRouteChatTransport({
    endpoint: "/api/chat",
  }),
  context: {
    threadId,
    tenantId,
  },
  prepareContextMessages: async ({ messages, context }) => {
    const summary = await summarizeForThread(context.threadId, messages);
    return [
      {
        role: "system",
        content: summary,
      },
    ];
  },
});
```
```js
const chat = useChat({
  transport: createRouteChatTransport({
    endpoint: "/api/chat",
  }),
  context: {
    threadId,
    tenantId,
  },
  prepareContextMessages: async ({ messages, context }) => {
    const summary = await summarizeForThread(context.threadId, messages);
    return [
      {
        role: "system",
        content: summary,
      },
    ];
  },
});
```

`prepareContextMessages` returns the context/history messages only. `useChat(...)` appends the outgoing user or resume message automatically.

> **Good to know:** Client `context` is request metadata, not trusted authorization state. Authenticate the route, rate-limit it, and derive sensitive values such as user id or permissions on the server.

Inside nodes, read server-approved request context with `useRuntimeContext(...)`.

```ts
import { useRuntimeContext } from "kortyx";

type AppContext = {
  userId: string;
  tenantId?: string;
};

export async function supportNode() {
  const context = useRuntimeContext<AppContext>();
  return `User: ${context.userId}`;
}
```
```js
import { useRuntimeContext } from "kortyx";

export async function supportNode() {
  const context = useRuntimeContext();
  return `User: ${context.userId}`;
}
```

See [Runtime Context](../02-core-concepts/08-runtime-context.md) for the full client-to-route-to-node flow.

## Runtime controls

`useChat(...)` exposes controls for common chat lifecycle cases:

- `abort()` stops the active stream when the transport supports `AbortSignal`
- `canAbort` is true while a stream is active
- `error` stores the latest transport or stream error
- `clearError()` clears that error state
- `clearMessages()` clears visible/persisted messages and keeps the current session
- `resetSession()` clears the current session id
- `resetChat()` clears messages, active stream state, errors, and session id

`clearChat()` remains available as a compatibility alias for resetting the chat.

> **Good to know:** `clearMessages()` is the right choice for a "clear visible history" button. Use `resetChat()` when you want a new local chat session.

## Interrupt responses

For low-level control, call `respondToHumanInput(...)` with the resume token and request id.

For UI components rendering a `HumanInputPiece`, use `respondToInterrupt(...)` so the component can pass back the same interrupt piece it received.

`respondToInterrupt(piece, { selected })` handles choice and multi-choice interrupts. `respondToInterrupt(piece, { text })` handles text interrupts.

> **Good to know:** When the live stream or latest assistant message contains a text interrupt, `send(text)` resumes that request automatically. Historical interrupts are not reused after a response or later assistant message.

When the server sets interrupt routing metadata, `HumanInputPiece` preserves `schemaId`, `schemaVersion`, `interruptId`, and public `meta`.
Switch on `piece.schemaId` for custom controls such as job pickers, file uploaders, or address autocompletes.

## Abort support

Route transports created with `createRouteChatTransport(...)` receive the `AbortSignal` from `useChat(...)` and pass it to `fetch`.

Custom transports should forward `context.signal` to their own request layer if they want `abort()` to stop the active stream.

## `useChat(...)` options

```ts
import type {
  ChatMsg,
  ChatStorage,
  ChatTransport,
  OutgoingChatMessage,
  ToHumanInputPiece,
} from "@kortyx/react";

type UseChatOptions = {
  transport: ChatTransport<Record<string, unknown>>;
  storage?: ChatStorage<ChatMsg>;
  createId?: () => string;
  context?: Record<string, unknown>;
  prepareContextMessages?: (args: {
    messages: ChatMsg[];
    sessionId: string;
    workflowId: string;
    reason: "send" | "resume";
    context: Record<string, unknown>;
  }) => OutgoingChatMessage[] | Promise<OutgoingChatMessage[]>;
  toHumanInputPiece?: ToHumanInputPiece;
};
```

Notes:

- `transport` is required
- `storage` defaults to browser storage
- `createId` is optional when you want custom message/piece ids
- `context` defaults to `{}`
- `prepareContextMessages` defaults to the finalized message history when `includeHistory` is true
- `toHumanInputPiece` lets advanced clients customize interrupt projection before pieces enter
  `streamContentPieces` and finalized assistant messages

## Transport helpers

### API route / SSE transport

```ts
import { createRouteChatTransport } from "@kortyx/react";

const transport = createRouteChatTransport({
  endpoint: "/api/chat",
  createBody: ({ sessionId, workflowId, messages, context }) => ({
    sessionId,
    workflowId,
    messages,
    context,
  }),
});
```
```js
import { createRouteChatTransport } from "@kortyx/react";

const transport = createRouteChatTransport({
  endpoint: "/api/chat",
  createBody: ({ sessionId, workflowId, messages, context }) => ({
    sessionId,
    workflowId,
    messages,
    context,
  }),
});
```

Use this when your backend returns SSE chunks from a route handler. `createBody` is optional; without it the route body is `{ sessionId, workflowId, messages, context }`.

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
