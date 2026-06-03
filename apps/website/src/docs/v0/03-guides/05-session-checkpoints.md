---
id: v0-session-checkpoints
title: "Session Checkpoints, Rollback, and Fork"
description: "Let users regenerate, edit-and-retry, undo, or branch a workflow session without losing server-side workflow state."
keywords: [kortyx, session-checkpoints, rollback, fork, regenerate, usechat]
sidebar_label: "Session Checkpoints"
---
# Session Checkpoints, Rollback, and Fork

Session checkpoints let an app move through a workflow history without pretending the visible chat transcript is the whole state.

Use them when users need to:

- regenerate the last assistant turn
- edit a previous input and retry
- undo the last message
- fork a session to try another branch
- keep canvas or artifact state aligned with the active session branch

## Prerequisites

- `@kortyx/agent` serving chat requests
- `@kortyx/react` if you use `useChat(...)`
- a `FrameworkAdapter`

In-memory persistence works for local development. Use Redis for production rollback/fork, cross-worker resume, or restart-safe sessions.

> **Good to know:** Checkpoints restore Kortyx runtime state. Your product records, documents, users, and long-term conversation history still belong in your app database.

## Configure the Server

Use one framework adapter for interrupts, LangGraph checkpoints, pending requests, and session checkpoints.

```ts
import { createAgent, createCheckpointRouteHandler } from "@kortyx/agent";
import { createRedisFrameworkAdapter } from "@kortyx/runtime";

const frameworkAdapter = createRedisFrameworkAdapter({
  url: process.env.REDIS_URL!,
});

export const agent = createAgent({
  workflowsDir: "src/workflows",
  defaultWorkflowId: "general-chat",
  frameworkAdapter,
});

export const POST = createCheckpointRouteHandler({ agent });
```
```js
import { createAgent, createCheckpointRouteHandler } from "@kortyx/agent";
import { createRedisFrameworkAdapter } from "@kortyx/runtime";

const frameworkAdapter = createRedisFrameworkAdapter({
  url: process.env.REDIS_URL,
});

export const agent = createAgent({
  workflowsDir: "src/workflows",
  defaultWorkflowId: "general-chat",
  frameworkAdapter,
});

export const POST = createCheckpointRouteHandler({ agent });
```

In a Next.js app, put the checkpoint handler in a route such as `app/api/kortyx/checkpoints/route.ts`. Keep your chat route on its existing endpoint.

Expected result: each completed turn emits a `checkpoint` stream chunk before `done`, and the checkpoint route can list, roll back, or fork that session.

## Configure the React Client

Pass a checkpoint endpoint to the route transport.

```tsx
import { createRouteChatTransport, useChat } from "@kortyx/react";

const transport = createRouteChatTransport({
  endpoint: "/api/kortyx/chat",
  checkpointEndpoint: "/api/kortyx/checkpoints",
});

export function ChatSurface() {
  const chat = useChat({ transport });

  return (
    <button
      type="button"
      disabled={!chat.lastAssistantId || chat.isStreaming}
      onClick={() => {
        if (chat.lastAssistantId) void chat.regenerate(chat.lastAssistantId);
      }}
    >
      Regenerate
    </button>
  );
}
```
```jsx
import { createRouteChatTransport, useChat } from "@kortyx/react";

const transport = createRouteChatTransport({
  endpoint: "/api/kortyx/chat",
  checkpointEndpoint: "/api/kortyx/checkpoints",
});

export function ChatSurface() {
  const chat = useChat({ transport });

  return (
    <button
      type="button"
      disabled={!chat.lastAssistantId || chat.isStreaming}
      onClick={() => {
        if (chat.lastAssistantId) void chat.regenerate(chat.lastAssistantId);
      }}
    >
      Regenerate
    </button>
  );
}
```

`useChat(...)` tracks checkpoint chunks on finalized assistant messages. `regenerate(...)` rolls the server back, drops invalidated client state, and replays the previous user action.

## Interrupt Responses Are Not Plain Prompts

This is the main reason checkpoint-aware regenerate exists.

If the user selects a job or agent from an interrupt UI, the visible message may look like a UUID:

```txt
user: Help me generate a guide
assistant: pick-job interrupt
user: job-uuid
assistant: pick-agent interrupt
user: agent-uuid
assistant: final summary
```

When the final summary is regenerated, Kortyx rolls back to the checkpoint where the workflow was waiting for the agent selection. Then `useChat(...)` replays `agent-uuid` as an interrupt response, not as a new natural-language prompt.

> **Good to know:** Normal chat messages and interrupt responses use the same visible `messages` list, but `useChat(...)` stores hidden source metadata for interrupt responses so rollback can replay the right protocol.

## High-Level Helpers

`useChat(...)` exposes these checkpoint helpers:

```ts
await chat.rollbackTo(checkpointId);
await chat.fork(checkpointId);
await chat.regenerate(assistantMessageId);
await chat.retryWithEdit(assistantMessageId, "Use a shorter format.");
```
```js
await chat.rollbackTo(checkpointId);
await chat.fork(checkpointId);
await chat.regenerate(assistantMessageId);
await chat.retryWithEdit(assistantMessageId, "Use a shorter format.");
```

`rollbackTo(...)` requires no active stream. If a stream is running, abort it first.

## Structured Data Invalidation

Rollback can invalidate structured data that lives outside chat bubbles, such as a guide canvas, preview pane, generated table, or extracted fields.

When a rollback discards checkpoints that produced structured streams, the server returns those stream ids. The stream protocol also includes:

```json
{
  "type": "structured-data-invalidated",
  "streamId": "guide-1",
  "checkpointId": "cp_123"
}
```

Frontend stores can decide how to react:

- chat-only UIs can ignore it
- artifact canvases can delete the old artifact
- editors can mark content stale
- Studio-style timelines can show the invalidated output

## Agent API

The low-level `Agent` methods are available when you need custom transports:

```ts
const checkpoints = await agent.listCheckpoints(sessionId);
const checkpoint = await agent.getCheckpoint(checkpointId);
const rollback = await agent.rollbackTo(checkpointId);
const fork = await agent.fork(checkpointId, {
  newSessionId: "optional-child-session-id",
});
```
```js
const checkpoints = await agent.listCheckpoints(sessionId);
const checkpoint = await agent.getCheckpoint(checkpointId);
const rollback = await agent.rollbackTo(checkpointId);
const fork = await agent.fork(checkpointId, {
  newSessionId: "optional-child-session-id",
});
```

`fork(...)` creates a new session whose runtime state starts from the checkpoint. Parent and child sessions are isolated after the fork.

## Storage Behavior

The Redis adapter uses the same Redis connection for all Kortyx framework state, with separate key spaces:

- pending interrupt requests
- internal LangGraph checkpoints
- user-facing session checkpoints

The in-memory adapter supports the same API for local development, but state is lost on restart and is not safe across multiple workers.

> **Good to know:** Rollback/fork restore saved `GraphState` and continue with the currently deployed workflow code. Deterministic replay across code changes requires versioned workflow artifacts and cached model/tool outputs, which are separate concerns.

## What to Read Next

- [Interrupts and Resume](./02-interrupts-and-resume.md)
- [Rendering Streamed Chat](./04-render-streamed-chat.md)
- [Runtime Persistence](../04-production/01-persistence.md)
- [Stream Protocol](../05-reference/03-stream-protocol.md)
