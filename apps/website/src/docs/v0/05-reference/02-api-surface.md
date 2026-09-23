---
id: v0-api-surface
title: "Main API Surface (kortyx)"
description: "Reference what the main kortyx package re-exports for application development."
keywords: [kortyx, api-surface, exports, facade, typescript]
sidebar_label: "API Surface"
---
# Main API Surface (`kortyx`)

`packages/kortyx/src/index.ts` is the public facade.

## Re-export groups

## Agent

```ts
export { createAgent } from "@kortyx/agent";
export type { CreateAgentArgs } from "@kortyx/agent";
```
```js
export { createAgent } from "@kortyx/agent";
```

Created agent methods:

- `agent.streamChat(messages, options?)` → `AsyncIterable<StreamChunk>`

## Core workflow/state contracts

```ts
export {
  defineWorkflow,
  loadWorkflow,
  validateWorkflow,
} from "@kortyx/core";
```
```js
export {
  defineWorkflow,
  loadWorkflow,
  validateWorkflow,
} from "@kortyx/core";
```

Plus types like `GraphState`, `NodeResult`, `WorkflowDefinition`, `WorkflowId`.

## Hooks

```ts
export {
  createWorkflowHooks,
  parallel,
  ParallelError,
  reportError,
  useWorkflow,
  WorkflowCallError,
  useInterrupt,
  useReason,
  useTool,
  useNodeState,
  useStructuredData,
  useWorkflowState,
} from "@kortyx/hooks";
```
```js
export {
  createWorkflowHooks,
  parallel,
  ParallelError,
  reportError,
  useWorkflow,
  WorkflowCallError,
  useInterrupt,
  useReason,
  useTool,
  useNodeState,
  useStructuredData,
  useWorkflowState,
} from "@kortyx/hooks";
```

`useTool({tool, input, id?, abortSignal?})` executes a shared tool immediately and returns its inferred result. It creates observations without adding a model call or MCP transport. `UseToolArgs`, `KortyxExecutableTool`, `ToolOutcomes`, `ToolOutcomeDescriptor`, `ToolTelemetry` and `ToolErrorDetails` are exported types. See [Hooks](../02-core-concepts/07-hooks.md).

`reportError(error, {severity?, metadata?, tags?})` records a handled error on the active workflow span without stopping execution. Thrown errors are recorded automatically and retain their ordinary retry/failure behavior. `ReportErrorOptions` is exported for wrappers and custom hooks.

`useWorkflow({ id, workflow, input })` returns a promise of `{ data }`. Typed definitions and bound registries infer input/output from the child's schemas; dynamic unbound strings return `Record<string, unknown>`. `WorkflowCallError` represents a rejected child invocation. See [Call Child Workflows](../03-guides/06-child-workflows.md).

`parallel([useWorkflow(...), useWorkflow(...)])` returns an inferred result tuple in input order. It joins independent children under shared execution control and preserves their snapshots before suspension. `ParallelError.results` exposes terminal fulfilled/rejected outcomes; interrupts, cancellation and limits remain control flow. The parent exposes approval only after every sibling finishes, fails or suspends, so a still-running sibling delays the request. Multiple child questions use the existing parent resume handle one at a time; immediate and batched approval delivery are not supported. See [parallel child workflows](../03-guides/06-child-workflows.md#run-independent-children-in-parallel).

## Providers

```ts
export * from "@kortyx/providers";
```
```js
export * from "@kortyx/providers";
```

Install provider implementation packages separately (for example `@kortyx/google`).

## Runtime + registries + framework adapters

```ts
export {
  clearRegisteredNodes,
  createFileWorkflowRegistry,
  createFrameworkAdapterFromEnv,
  createInMemoryFrameworkAdapter,
  createInMemoryWorkflowRegistry,
  createRedisFrameworkAdapter,
  getRegisteredNode,
  listRegisteredNodes,
  registerNode,
} from "@kortyx/runtime";
```
```js
export {
  clearRegisteredNodes,
  createFileWorkflowRegistry,
  createFrameworkAdapterFromEnv,
  createInMemoryFrameworkAdapter,
  createInMemoryWorkflowRegistry,
  createRedisFrameworkAdapter,
  getRegisteredNode,
  listRegisteredNodes,
  registerNode,
} from "@kortyx/runtime";
```

## Stream helpers

```ts
export {
  collectBufferedStream,
  collectStream,
  consumeStream,
  createStreamResponse,
  readStream,
  summarizeStreamChunks,
  toSSE,
} from "@kortyx/stream";
export type { BufferedStreamResult, StreamChunk } from "@kortyx/stream";
```
```js
export {
  collectBufferedStream,
  collectStream,
  consumeStream,
  createStreamResponse,
  readStream,
  summarizeStreamChunks,
  toSSE,
} from "@kortyx/stream";
```

- `collectStream(...)`: raw chunk array
- `collectBufferedStream(...)`: `{ chunks, text, structured }`

## Browser entry

`packages/kortyx/src/browser.ts` exports browser-safe pieces:

- `readStream`
- `StreamChunk` type

Use this entry for client-only bundles where you want to avoid Node-only runtime exports.

## Workflow execution

`agent.execute({ workflow, input, sessionId?, context? })` returns a typed `ExecutionResult` for a registered workflow with input/output schemas. `agent.resume({ workflow, resume, response })` continues a suspended execution, including nested children. Outcomes are `completed`, `suspended`, `cancelled`, or `failed`; invalid commands reject with `ExecutionRequestError`. See [Execute and Resume Workflows](../03-guides/07-workflow-execution.md).

## Response completion and pending interrupts

- `completeResponse(options?: { message?: string; data?: unknown }): Promise<void>`: close chat output from a root node, continuing execution.
- `agent.listInterrupts({ sessionId?, runId?, context?, status?: "pending", afterResponseCompleted? })`: list ready, unexpired public interrupt summaries. Supply at least one nonempty authorized scope.
- `agent.getInterrupt(id, { sessionId?, runId?, context? })`: lookup within scope; returns null or the summary plus a private server-only resume handle.
- `agent.streamChat(messages, { onExecution?, executionSignal?, clientTurnId?, onResponseFinalized?, continueOnDisconnect?, ... })`: observe attempt completion and optionally collect a finalized visible message independent of HTTP consumption.
- `createChatRouteHandler({ agent, onExecution?, disconnect?, onTurnAccepted?, onResponseFinalized?, onLifecycleError? })`: connect host lifetime and optional app-owned transcript persistence. Hooks require `sessionId` and `clientTurnId`; `disconnect: "continue"` requires `onExecution`.
- `createCheckpointRouteHandler({ agent, onForked?, onRolledBack?, onLifecycleError? })`: report successful runtime fork and rollback facts so the app can update its transcript. The hooks do not make runtime and app writes atomic.

Existing useInterrupt and agent.resume APIs remain unchanged. See the [complete guide](/docs/guides/background-continuation) for ordering, checkpoints, scope authorization, parallel branches, and Studio's optional read-only role.
For the server-owned transcript callback contract, see
[Server-Owned Chat Transcripts](../03-guides/09-server-owned-chat-transcripts.md).

Tool faults automatically include their error type and bounded message, with no extra wiring. An optional `tool.telemetry.error(error)` override returns `{type, message}` or `null` to replace or suppress diagnostics before export. Stack traces, exception causes/custom fields and raw tool inputs/results remain excluded.


`KortyxErrorDetails` and `KortyxTraceErrorProjection` are exported tracing types. Configured Studio/OpenTelemetry adapters automatically capture bounded exception type/message/stack/cause diagnostics; their optional `error` projection can replace or suppress that diagnostic. JSON/schema parsing errors remain separately diagnosable even when the provider stopped normally. This does not change client-facing execution/HTTP failure descriptors.
