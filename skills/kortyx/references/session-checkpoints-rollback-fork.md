# Session Checkpoints, Rollback, And Fork

Use this reference when adding checkpoint, rollback, fork, regenerate, retry-with-edit, undo, or time-travel behavior to an application built with Kortyx.

## Table Of Contents

- [Goal](#goal)
- [Use The Public API](#use-the-public-api)
- [Persistence Choice](#persistence-choice)
- [Server Setup](#server-setup)
- [React Setup](#react-setup)
- [Regenerate And Retry](#regenerate-and-retry)
- [Fork](#fork)
- [Structured Data Cleanup](#structured-data-cleanup)
- [Workflow Changes](#workflow-changes)
- [App Checklist](#app-checklist)

## Goal

Use session checkpoints when the app needs to go back to a previous conversation turn without leaving server-side workflow state behind.

Use this feature for:

- regenerating an assistant response
- editing a previous user message and retrying
- undoing the last user action
- trying an alternate branch from an earlier turn
- moving a session between processes or devices
- debugging how workflow state evolved over time

Do not build these behaviors by only editing the frontend `messages` array. Kortyx sessions can include server-side state that is not visible in chat history:

- workflow state from `useWorkflowState(...)`
- node state from `useNodeState(...)`
- pending interrupt state
- cached hook results
- structured streams rendered in canvases, previews, or editors

The checkpoint API keeps the frontend transcript and server-side session state aligned.

## Use The Public API

Application server code should import Kortyx APIs from `kortyx`:

```ts
import {
  createAgent,
  createCheckpointRouteHandler,
  createChatRouteHandler,
} from "kortyx";
```

Use documented public imports in examples; prefer `kortyx` for server-side agent, route, persistence, and stream helpers.

React applications can use the official React client package when they use `useChat`:

```ts
import { createRouteChatTransport, useChat } from "@kortyx/react";
```

The application-facing checkpoint operations are:

```ts
await agent.listCheckpoints(sessionId);
await agent.getCheckpoint(checkpointId);
await agent.rollbackTo(checkpointId);
await agent.fork(checkpointId, { newSessionId });
```

## Persistence Choice

For local development, in-memory persistence is enough.

For production, choose Redis, PostgreSQL, or PostgreSQL plus Redis when checkpoints
must survive process restarts, serverless cold starts, multiple workers, or
mobile-to-desktop handoff:

- Redis provides shared TTL-oriented runtime state.
- PostgreSQL provides authoritative durable history and retention.
- PostgreSQL plus Redis keeps PostgreSQL authoritative and uses Redis as a payload
  cache.

The same framework adapter supports:

- interrupt resume state
- internal replay/idempotency checkpoints
- user-facing session checkpoints

Apps do not need a separate adapter just for user-facing checkpoints. Read
[Runtime Persistence](architecture-runtime-persistence.md) for setup and retention
tradeoffs.

Memory and Redis session checkpoint retention defaults to the last 50 checkpoints
per session and can be tuned with `maxSessionCheckpoints`. PostgreSQL uses its
configured history and inactive-session retention windows instead of that count cap.

In-memory persistence supports the same API, but it is a development and single-process fallback:

- state is lost on restart
- state is not shared across workers or serverless instances
- session checkpoints are capped by count per session
- session checkpoint records do not have a global memory cap or TTL

For hundreds of users or long-lived sessions, use a shared production adapter.
Memory pressure in the in-process adapter is roughly proportional to
`active sessions * maxSessionCheckpoints * checkpoint state size`.

Keep product data in the app database. Kortyx persistence is for runtime/session state, not the app's source-of-truth records.

## Server Setup

Create the agent with shared persistence when the app needs production
rollback/fork behavior. This is a Redis example; use the PostgreSQL or composed
adapter when the retention model calls for it:

```ts
import {
  createAgent,
  createChatRouteHandler,
  createCheckpointRouteHandler,
  createRedisFrameworkAdapter,
} from "kortyx";

const agent = createAgent({
  workflows,
  frameworkAdapter: createRedisFrameworkAdapter({
    url: process.env.REDIS_URL,
    maxSessionCheckpoints: 50,
  }),
});

export const chatRoute = createChatRouteHandler({ agent });
export const checkpointRoute = createCheckpointRouteHandler({ agent });
```

Expose chat and checkpoint operations on separate endpoints. For example:

```ts
// app/api/kortyx/chat/route.ts
export const POST = createChatRouteHandler({ agent });

// app/api/kortyx/checkpoints/route.ts
export const POST = createCheckpointRouteHandler({ agent });
```

Require the app's normal session authorization before allowing checkpoint operations. A user who cannot access a session should not be able to list, roll back, or fork its checkpoints.

## React Setup

Configure the transport with both endpoints:

```ts
import {
  createRouteChatTransport,
  useChat,
  type ChatMsg,
  type ChatStorage,
} from "@kortyx/react";

const transport = createRouteChatTransport({
  endpoint: "/api/kortyx/chat",
  checkpointEndpoint: "/api/kortyx/checkpoints",
});

const storage: ChatStorage<ChatMsg> = {
  async load() {
    const response = await fetch(`/api/chat-state/${threadId}`);
    if (!response.ok) return {};
    const state = await response.json();
    return {
      sessionId: state.sessionId,
      messages: state.messages,
      workflowId: state.workflowId ?? "",
      includeHistory: false,
    };
  },
  async save(state) {
    await saveVisibleChatState(threadId, state);
  },
  async clearMessages() {
    await clearVisibleChatState(threadId);
  },
};

const chat = useChat({
  transport,
  storage,
});
```

`useChat(...)` has no `sessionId` option. Its active session is generated on first
send or restored from `ChatStorage.load()`. Hydrate an existing server-owned
session and visible transcript through custom storage. When the server owns
authoritative conversation history, load it at the authenticated route boundary,
keep `includeHistory: false`, and do not trust a client transcript as the source of
truth.

Use the checkpoint helpers instead of manually mutating message history:

```ts
await chat.regenerate(assistantMessageId);
await chat.retryWithEdit(assistantMessageId, editedText);
const fork = await chat.fork(checkpointId);
await chat.rollbackTo(checkpointId);
```

Use `checkpointForMessage(messageId)` when the UI needs to attach an undo, fork, or debug control to a specific message.

## Regenerate And Retry

For a normal user prompt, regenerate should:

1. find the checkpoint before the assistant message
2. call `rollbackTo(checkpointId)`
3. remove later messages from the client view
4. remove invalidated structured data
5. resend the previous user message

For an interrupt response, regenerate should replay the saved interrupt response metadata as a resume payload. Do not send a raw selection value such as `template-uuid` as a new natural-language prompt.

For retry-with-edit, roll back to the same checkpoint, replace the previous user content, then send the edited content through the normal chat transport.

## Fork

Use fork when the app wants an alternate branch while preserving the original session.

Common product patterns:

- "Try a different approach"
- "Compare two versions"
- "Continue from here in a new thread"
- "Duplicate this conversation before experimenting"

Fork creates a new `sessionId` whose initial runtime state equals the selected checkpoint. The parent session remains unchanged.

Do not implement fork by copying visible messages into a new session. That loses hidden workflow state and can mis-handle interrupts.

## Structured Data Cleanup

Rollback can invalidate structured streams produced after the target checkpoint.

When the app receives invalidated stream ids, delete or mark stale any UI state keyed by those ids:

- generated report previews
- canvas artifacts
- editor drafts
- tables or charts
- side-panel structured outputs

The app can ignore the invalidation signal if it does not store structured outputs outside normal chat rendering.

## Workflow Changes

Checkpoints restore saved session state, then continue with the currently deployed workflow code.

Do not promise perfect replay across code changes. If the app changes workflow ids, node ids, state shapes, or interrupt contracts, old checkpoints may need a migration or a clear compatibility error.

For production apps, store a workflow version or build id in checkpoint metadata when available. Show a friendly error if a user tries to roll back to a checkpoint that the current workflow cannot safely continue.

## App Checklist

- Use `kortyx` imports for server APIs in app examples and docs.
- Add a checkpoint endpoint next to the chat endpoint.
- Use durable persistence for production rollback/fork behavior.
- Explain that in-memory checkpoint persistence is for development, not high-volume production traffic.
- Set or document `maxSessionCheckpoints` for memory/Redis, or retention windows
  for PostgreSQL.
- Protect checkpoint endpoints with the same authorization as chat sessions.
- Use `useChat` checkpoint helpers for regenerate, retry, undo, and fork.
- Clean up structured outputs when invalidation ids are returned.
- Document checkpoint retention for the app, such as a count cap in Redis or a
  history window in PostgreSQL.
- Avoid examples tied to the original discussion; prefer generic project/template/report examples.
