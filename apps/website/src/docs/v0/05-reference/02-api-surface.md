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
  useWorkflow,
  WorkflowCallError,
  useInterrupt,
  useReason,
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
  useWorkflow,
  WorkflowCallError,
  useInterrupt,
  useReason,
  useNodeState,
  useStructuredData,
  useWorkflowState,
} from "@kortyx/hooks";
```

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
- `agent.streamChat(messages, { onExecution?, executionSignal?, ... })`: observe attempt completion for host lifetime and independently control server cancellation.
- `createChatRouteHandler({ agent, onExecution? })`: connect chat attempt lifetime to the hosting framework.

Existing useInterrupt and agent.resume APIs remain unchanged. See the [complete guide](/docs/guides/background-continuation) for ordering, checkpoints, scope authorization, parallel branches, and Studio's optional read-only role.
