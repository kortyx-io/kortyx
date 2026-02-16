---
id: v0-process-chat
title: "processChat"
description: "Run one chat cycle with workflow resolution, graph execution, resume handling, and SSE output."
keywords: [kortyx, processChat, sse, workflow-selection, resume]
sidebar_label: "processChat"
---
# processChat

`processChat` runs one request/response cycle and returns an SSE `Response`.

## Signature (practical)

```ts
await processChat({
  messages,
  options,
  sessionId,
  defaultWorkflowId,
  loadRuntimeConfig,
  selectWorkflow, // or workflowRegistry
  frameworkAdapter,
  getProvider,
  memoryAdapter,
  applyResumeSelection,
});
```

## What it does

1. loads runtime config (`loadRuntimeConfig`)
2. resolves a workflow (`selectWorkflow` / `workflowRegistry`)
3. builds initial state (`buildInitialGraphState`)
4. handles resume flow if last message carries resume metadata
5. compiles graph (`createLangGraph`)
6. orchestrates stream (`orchestrateGraphStream`)
7. returns `createStreamResponse(...)`

## Workflow override per request

When not resuming, `options.workflowId` (or `options.workflow`) can override entry workflow for this request.

## Resume customization

`applyResumeSelection` lets you map selected interrupt options into state patches before resuming.
