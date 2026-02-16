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
export { createAgent, processChat } from "@kortyx/agent";
export type { CreateAgentArgs, ProcessChatArgs } from "@kortyx/agent";
```

## Core workflow/state contracts

```ts
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
  useAiInterrupt,
  useAiMemory,
  useAiProvider,
  useEmit,
  useNodeState,
  useStructuredData,
  useWorkflowState,
} from "@kortyx/hooks";
```

## Memory

```ts
export {
  createInMemoryAdapter,
  createPostgresAdapter,
  createRedisAdapter,
} from "@kortyx/memory";
```

## Providers

```ts
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

## Stream helpers

```ts
export { createStreamResponse, readStream } from "@kortyx/stream";
export type { StreamChunk } from "@kortyx/stream";
```

## Browser entry

`packages/kortyx/src/browser.ts` exports browser-safe pieces:

- `readStream`
- `StreamChunk` type

Use this entry for client-only bundles where you want to avoid Node-only runtime exports.
