# `useChat(...)`

Use `useChat(...)` for batteries-included streamed chat state.

## Basic Shape

```ts
"use client";

import { createRouteChatTransport, useChat } from "@kortyx/react";

export function ChatPage({ threadId }: { threadId: string }) {
  const chat = useChat({
    transport: createRouteChatTransport({ endpoint: "/api/chat" }),
    context: { threadId },
  });

  return <ChatWindow chat={chat} />;
}
```

## Provides

- `messages`: finalized chat history.
- `streamContentPieces`: in-flight assistant response.
- `isStreaming`: active stream flag.
- `error` and `clearError()`.
- `abort()` and `canAbort`.
- interrupt resume helpers.
- default browser storage unless overridden.
- `workflowId` and `setWorkflowId`.
- `includeHistory` and `setIncludeHistory`.
- `clearMessages()`, `resetSession()`, `resetChat()`, and `clearChat()`.

## Sending

Call `send(text)` for a normal user message.

```ts
await chat.send(inputValue);
```

If an active text interrupt exists, `send(...)` responds to that interrupt instead of starting a new normal turn. "Active" means a `kind: "text"` interrupt in the live stream or latest assistant message. Historical interrupts are not reused after a response or later assistant message. See `react-interrupts.md` "Text Interrupts And `send(...)` Auto-Resume" for details.

## Context

Pass `context` for request metadata such as `threadId` or `tenantId`, but authenticate and derive sensitive values on the server.

```ts
const chat = useChat({
  transport: createRouteChatTransport({ endpoint: "/api/chat" }),
  context: {
    threadId,
    tenantId,
  },
});
```

The default route transport sends `{ sessionId, workflowId, messages, context }`. Route handlers should forward the approved context to `agent.streamChat(..., { context })`, and nodes can read it with `useRuntimeContext<T>()`.

Use `prepareContextMessages` when the app owns a custom history strategy, such as server-side history, summaries, or key facts.

```ts
type ChatContext = {
  threadId: string;
};

const chat = useChat<ChatContext>({
  transport,
  context: { threadId },
  prepareContextMessages: async ({ context }) => {
    // App-owned history helper. Replace with your DB/service call.
    const summary = await loadThreadSummary(context.threadId);
    return [{ role: "system", content: summary }];
  },
});
```

`prepareContextMessages` returns only the context/history messages. `useChat(...)` appends the outgoing user or resume message automatically.

## Workflow And History Controls

- `setWorkflowId(id)`: selects the workflow id sent with future requests.
- `includeHistory`: when true, finalized `messages` are sent as context by default.
- `setIncludeHistory(false)`: useful when the backend owns history or uses summaries.
- `clearMessages()`: clears visible/persisted messages but keeps the session id.
- `resetSession()`: creates a new session id on the next send.
- `resetChat()`: clears messages, active stream state, errors, and session id.
- `clearChat()`: compatibility alias for `resetChat()`.

## Errors And Abort

- Render `error` and provide `clearError()`.
- Show an abort control when `canAbort` is true.
- `abort()` cancels the active stream when the transport forwards `AbortSignal`.

## Storage

Browser storage is used by default. Pass `storage` when the app needs custom persistence or no browser persistence.
