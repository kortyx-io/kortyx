---
id: v0-server-owned-chat-transcripts
title: "Server-Owned Chat Transcripts"
description: "Persist accepted turns and finalized assistant messages from Kortyx route hooks without consuming the SSE response."
keywords: [kortyx, chat, transcript, persistence, useChat, checkpoints]
sidebar_label: "Server-Owned Transcripts"
---
# Server-Owned Chat Transcripts

Use the chat route's lifecycle hooks when your application database owns the
visible conversation. Kortyx keeps execution and checkpoint state; your app
stores the transcript and decides who can read it. The hooks receive server-side
facts without reading or teeing the SSE response.

## Chat route contract

```ts
createChatRouteHandler({
  agent,
  onTurnAccepted: async ({ request, sessionId, clientTurnId, userMessage, kind }) => {
    // Insert or update a pending user turn in the authenticated app session.
  },
  onResponseFinalized: async ({
    request, sessionId, runId, clientTurnId, status, checkpointId, message,
  }) => {
    // Upsert the finalized assistant message and status in the app DB.
  },
  onLifecycleError: ({ phase, clientTurnId, error }) => {
    // Report a ChatLifecycleHookError to app telemetry.
  },
});
```

Both hooks require a nonempty `sessionId` and `clientTurnId` in the request. The
default `@kortyx/react` route transport sets `clientTurnId` to the user message ID
for prompts and interrupt responses. Keep that ID when retrying the same turn.
Scope database upserts by the authenticated conversation. A stable ID prevents
duplicate transcript rows; it does not prevent a second model execution.

`onTurnAccepted` runs before execution. It receives the accepted user message and
`kind: "prompt" | "interrupt-response"`, so the app can show a pending turn on
reload. If this callback fails, the route returns a typed persistence error and
does not start the run. A run that fails to start later can leave a pending row;
reconcile stale rows in the app.

`onResponseFinalized` runs after the response's checkpoint decision. Its
`message` is one normalized assistant message with `role`, `content`, and ordered
`contentPieces` for text, reduced structured data, pending interrupts, and
errors. `status` is `completed`, `failed`, `cancelled`, or `interrupted` for the
visible response. This is **not** a chunk array or the buffered `stream: false`
HTTP shape (`{ chunks, text, structured }`). A failed or interrupted response
may include partial pieces. `checkpointId` is present when a session checkpoint
was committed. Work after `completeResponse()` can continue independently and
does not change this finalized message.

## Keep execution alive after a disconnect

The default route behavior cancels cooperative execution when the client
disconnects. For server-owned persistence that must finish after a reader closes,
set `disconnect: "continue"` and supply `onExecution` to retain host lifetime:

```ts
import { after } from "next/server";

createChatRouteHandler({
  agent,
  disconnect: "continue",
  onExecution: (completion) => after(() => completion),
  onTurnAccepted,
  onResponseFinalized,
});
```

The completion promise includes the finalization callback. With continuation
enabled, a browser abort closes delivery but does not cancel server work. If the
product needs a Stop action, implement an authorized server cancellation path
using a custom route and `executionSignal`. See the
[background continuation guide](./08-background-continuation.md#save-the-visible-chat-response-on-the-server)
for a complete authenticated route example.

## Fork and rollback

The checkpoint route is separate from the chat route. Configure
`createCheckpointRouteHandler({ onForked, onRolledBack, onLifecycleError })` to
update app-owned transcript branches after successful runtime mutations.
`onForked` supplies source/new session and checkpoint IDs. `onRolledBack`
supplies the new head checkpoint ID and invalidated structured-stream IDs.
Kortyx cannot identify app turn IDs to invalidate; map checkpoints to turns in
your database. Authorize each checkpoint request before passing it to the
generated handler. See [Session Checkpoints](./05-session-checkpoints.md#storage-behavior).

## Delivery and access boundaries

Finalization and checkpoint hook failures leave the runtime result intact and
reach `onLifecycleError` as `ChatLifecycleHookError`. Hooks are attempted once
per run attempt while the process is alive. They are not a durable outbox or a
transaction with the app database. Reconcile stale pending rows, or use an
app-owned durable outbox when crash recovery is required.

Authenticate the session before the generated handler; client-supplied IDs and
context are not ownership proof. A finalized interrupt piece includes a resume
token for reload, so protect transcript reads as carefully as checkpoint
routes. Use `ChatStorage.load()` to hydrate the server-owned transcript in
`useChat`; avoid overwriting it with an older browser snapshot. When the server
supplies model history, keep `includeHistory: false`.
