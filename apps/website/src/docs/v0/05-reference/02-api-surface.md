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
