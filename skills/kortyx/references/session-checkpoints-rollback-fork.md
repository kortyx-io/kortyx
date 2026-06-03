# Session Checkpoints, Rollback, And Fork

Use this reference when implementing, reviewing, or debugging user-facing session checkpoints, rollback, fork, regenerate, retry-with-edit, undo, or time-travel style behavior.

## Core Principle

Do not implement regenerate or fork by copying/truncating the frontend transcript.

Kortyx workflows can have hidden server-side state:

- `GraphState`
- `runtime.__kortyx`
- `useWorkflowState(...)`
- `useNodeState(...)`
- pending interrupt requests
- `useReason({ interrupt })` first-pass state
- structured streams rendered outside chat

The correct primitive is a session-level checkpoint that snapshots the authoritative runtime state at a turn boundary.

## MVP Decisions

Lock these decisions before coding:

- Public granularity: turn-boundary checkpoints only.
- Storage: add a `SessionCheckpointStore`; do not overload the LangGraph checkpointer.
- Production: in-memory for dev, Redis or durable adapter for production.
- Snapshot style: eager full-state snapshots for MVP.
- Fork style: eager copy into a new `sessionId`.
- Streaming: no mid-stream rollback in MVP; require abort or `isStreaming === false`.
- Replay across workflow code changes: best effort. Restore state, then continue with currently deployed code.
- Retention: default last 50 checkpoints per session, configurable.

## Package Boundaries

Implement the feature across these packages.

### `@kortyx/runtime`

Add a store interface separate from `FrameworkAdapter.checkpointer`:

```ts
type SessionCheckpointStore = {
  list(sessionId: string): Promise<CheckpointSummary[]>;
  get(id: string): Promise<SessionCheckpointRecord | null>;
  getHead(sessionId: string): Promise<SessionCheckpointRecord | null>;
  append(args: AppendSessionCheckpointArgs): Promise<SessionCheckpointRecord>;
  rollbackTo(id: string): Promise<RollbackSessionCheckpointResult>;
  fork(id: string, options?: { newSessionId?: string }): Promise<ForkSessionCheckpointResult>;
};
```

Store records should include:

- `id`, `sessionId`, `turnIndex`, `createdAt`
- `workflow`, `runId`, `nodes`
- full `GraphState`
- structured stream ids produced since the previous checkpoint
- interrupt tokens / pending requests active at that boundary
- optional `label`, `workflowVersion`, `buildId`

Wire the store into `FrameworkAdapter`:

- `createInMemoryFrameworkAdapter(...)` uses `createInMemorySessionCheckpointStore(...)`.
- `createRedisFrameworkAdapter(...)` uses the same Redis connection as pending requests and internal checkpoints, with a separate key prefix.

Redis key spaces should stay separate:

- pending interrupts
- internal LangGraph checkpoints
- session checkpoints

### `@kortyx/stream`

Add chunk types:

```ts
{ type: "checkpoint"; id: string; sessionId: string; turnIndex: number; label?: string }
{ type: "structured-data-invalidated"; streamId: string; checkpointId: string }
```

The `checkpoint` chunk must be emitted before the public `done` chunk. If the internal graph transformer yields `done`, hold it, persist the session checkpoint, emit `checkpoint`, then emit public `done`.

### `@kortyx/agent`

Expose low-level APIs:

```ts
agent.listCheckpoints(sessionId);
agent.getCheckpoint(checkpointId);
agent.rollbackTo(checkpointId);
agent.fork(checkpointId, { newSessionId });
```

Agent responsibilities:

- On final turn boundary, append a session checkpoint from final `GraphState`.
- Track touched node ids and structured stream ids during orchestration.
- Track pending interrupt records and update them with final paused state before checkpointing.
- On rollback, delete invalidated pending interrupt tokens and restore active pending requests from the target checkpoint.
- On fork, create a child session snapshot and save child pending requests with new resume tokens/request ids.
- On non-resume `streamChat`, start from the session checkpoint head if it exists; merge in the new input and current runtime config.

Add HTTP helpers for route-based apps:

- `createCheckpointRouteHandler({ agent })`
- `handleCheckpointRequestBody(...)`
- `parseCheckpointRequestBody(...)`

Keep the chat route and checkpoint route separate.

### `@kortyx/react`

Extend route transport with optional checkpoint methods:

```ts
createRouteChatTransport({
  endpoint: "/api/kortyx/chat",
  checkpointEndpoint: "/api/kortyx/checkpoints",
});
```

Extend `useChat(...)` with:

- `checkpoints`
- `checkpointForMessage(messageId)`
- `rollbackTo(checkpointId)`
- `fork(checkpointId)`
- `regenerate(assistantMessageId)`
- `retryWithEdit(assistantMessageId, newUserContent)`

Attach checkpoint chunk metadata to finalized assistant messages:

- `checkpointId`
- `checkpointTurnIndex`

Interrupt responses must carry hidden source metadata so regenerate can replay them as resume payloads, not normal text prompts.

Normal user prompts should keep the existing visible message shape unless metadata is actually needed.

## Regenerate Semantics

For a normal prompt:

1. Find the checkpoint before the assistant message.
2. Call server `rollbackTo(checkpointId)`.
3. Drop client messages after that checkpoint boundary.
4. Delete invalidated structured streams.
5. Send the previous user text again.

For an interrupt response:

1. Roll back to the checkpoint where the interrupt was pending.
2. Drop client messages after that checkpoint boundary.
3. Replay the previous user action as `{ metadata: { resume: { token, requestId, selected } } }`.

Never send an interrupt response value such as `template-uuid` as a fresh natural-language user prompt.

## Structured Data Invalidation

Rollback results should include:

```ts
{
  invalidatedStructuredStreamIds: string[];
  invalidatedInterruptTokens: string[];
}
```

Clients should delete or mark stale any artifact/canvas/editor state keyed by invalidated `streamId`.

Use generic examples in docs and tests, such as project/template/report flows. Avoid reusing domain-specific examples from the original discussion.

## `useReason` Behavior

Rollback/fork restores the state the node uses to build `useReason(...)` inputs:

- `GraphState`
- workflow/node state
- pending interrupt state
- new user or resume input

It does not automatically guarantee deterministic replay of completed model calls. If a rollback targets before a completed `useReason` call, the model may be called again. That is usually correct for regenerate.

Full no-model-call replay requires a durable effect/result cache and versioned workflow artifacts; treat that as a separate feature.

## Workflow Code Changes

Do not promise deterministic replay across deploys.

Recommended metadata:

- `workflowVersion`
- `buildId`

Behavior:

- rollback/fork restore saved state
- continuation uses current code
- if workflow ids, node ids, or state shapes changed incompatibly, the app may need a migration or a compatibility error

## Tests

Add focused tests for:

- in-memory session checkpoint store append/list/head/rollback/fork
- rollback invalidates structured stream ids and trailing interrupt tokens
- fork creates an isolated child session and child pending requests
- checkpoint chunk is emitted before `done`
- checkpoint metadata is attached to finalized React assistant messages
- route checkpoint handler dispatches list/get/rollback/fork
- type-checks for `@kortyx/runtime`, `@kortyx/stream`, `@kortyx/agent`, and `@kortyx/react`

Run:

```bash
pnpm turbo run type-check --filter=@kortyx/runtime --filter=@kortyx/stream --filter=@kortyx/agent --filter=@kortyx/react
pnpm turbo run test --filter=@kortyx/runtime --filter=@kortyx/stream --filter=@kortyx/agent --filter=@kortyx/react
```

If docs changed, also run:

```bash
pnpm --filter=kortyx-website type-check
```
