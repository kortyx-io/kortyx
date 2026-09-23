# Server-owned chat transcripts

Use `createChatRouteHandler` lifecycle hooks when the app DB owns visible chat
history. Kortyx runtime persistence stores execution/checkpoints, not the
product transcript. Public guide: `/docs/guides/server-owned-chat-transcripts`.

## Chat route

- Authenticate the user and authorize the session before invoking the generated
  route handler. Never trust client `sessionId` or `context` as authorization.
- Provide `onTurnAccepted` to upsert a pending user turn before execution. It
  receives `request`, `sessionId`, `clientTurnId`, `userMessage`, and `kind`
  (`prompt` or `interrupt-response`). Failure rejects the request before the run.
- Provide `onResponseFinalized` to upsert the assistant turn after the visible
  response's checkpoint decision. It receives `request`, `sessionId`, `runId`,
  `clientTurnId`, `status`, optional `checkpointId`, and one normalized `message`
  with `content` and ordered `contentPieces` (text, reduced structured data,
  interrupt, error). This is neither an SSE chunk array nor the `stream: false`
  HTTP wrapper. A failed or interrupted response can have partial pieces.
- Both hooks require nonempty `sessionId` and `clientTurnId`. The default
  `@kortyx/react` route transport sends the user message ID as `clientTurnId`.
  Reuse it on retry and upsert within the authorized conversation. This avoids
  duplicate transcript rows, not duplicate model execution.
- Set `disconnect: "continue"` and retain the `onExecution` promise through the
  host lifetime mechanism when server work must finish after the SSE reader
  closes. Browser abort then closes delivery only. A Stop control needs a
  separate authorized server cancellation path and `executionSignal`.
- Send callback failures to `onLifecycleError` (typed
  `ChatLifecycleHookError`). Finalization failure does not rewrite a completed
  runtime outcome. Hook delivery is one in-process attempt; reconcile stale
  rows or add an app-owned outbox for crash recovery.

## Checkpoint route and client

- Wire `createCheckpointRouteHandler({ onForked, onRolledBack,
  onLifecycleError })` separately. Runtime mutations succeed before these hooks;
  callback failure requires app reconciliation. Fork provides source/new
  session/checkpoint IDs. Rollback provides head checkpoint and invalidated
  structured-stream IDs. Map checkpoint IDs to application turn IDs yourself.
- An interrupt piece carries a resume token for reload. Protect transcript
  reads, and persist only the accepted user fields your app needs; user-message
  metadata may contain a resume token too.
- Hydrate finalized history through `ChatStorage.load()`. Keep server history
  authoritative; do not overwrite it with a stale browser `save()` snapshot.
  If the server supplies model context, use `includeHistory: false`.

See `references/response-completion.md` for `completeResponse()` timing and
host continuation, and `references/session-checkpoints-rollback-fork.md` for
runtime checkpoint semantics.
