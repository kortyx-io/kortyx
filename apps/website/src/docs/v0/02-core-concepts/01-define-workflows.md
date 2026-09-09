---
id: v0-define-workflows
title: "Define Workflows"
description: "Define type-safe workflows and node behavior with Kortyx core contracts."
keywords: [kortyx, defineWorkflow, workflow-schema, node-result]
sidebar_label: "Define Workflows"
---
# Define Workflows

The core contract lives in `@kortyx/core` and is exposed through `kortyx`.

> **Good to know:** If you want the mental model for what a node receives and returns, start with [Nodes](./03-nodes.md) before using this page as the workflow shape reference.

## TypeScript workflow (recommended)

```ts
import { defineWorkflow } from "kortyx";
import { google } from "@/lib/providers";
import { classifyNode } from "@/nodes/classify.node";
import { answerNode } from "@/nodes/answer.node";

export const supportWorkflow = defineWorkflow({
  id: "support",
  version: "1.0.0",
  description: "Simple support flow",
  nodes: {
    classify: {
      run: classifyNode,
      params: { model: google("gemini-2.5-flash") },
      behavior: {
        retry: { maxAttempts: 2, delayMs: 200 },
      },
    },
    answer: {
      run: answerNode,
      params: {},
    },
  },
  edges: [
    ["__start__", "classify"],
    ["classify", "answer", { when: "support.answer" }],
    ["answer", "__end__"],
  ],
});
```

```js
import { defineWorkflow } from "kortyx";
import { google } from "@/lib/providers";
import { classifyNode } from "@/nodes/classify.node";
import { answerNode } from "@/nodes/answer.node";

export const supportWorkflow = defineWorkflow({
  id: "support",
  version: "1.0.0",
  description: "Simple support flow",
  nodes: {
    classify: {
      run: classifyNode,
      params: { model: google("gemini-2.5-flash") },
      behavior: {
        retry: { maxAttempts: 2, delayMs: 200 },
      },
    },
    answer: {
      run: answerNode,
      params: {},
    },
  },
  edges: [
    ["__start__", "classify"],
    ["classify", "answer", { when: "support.answer" }],
    ["answer", "__end__"],
  ],
});
```

## Callable workflows

A workflow called by `useWorkflow(...)` declares `inputSchema` and `outputSchema`. Its last node returns ordinary `data` and reaches `__end__`; the runtime validates accumulated child data and returns it to the caller. Existing root workflows can omit these schemas.

Calls live in node code or custom hooks. Register both workflows with the agent; no special call edge or return node is required. See [Call Child Workflows](../03-guides/06-child-workflows.md) for typed definitions, string IDs, and interrupts.

## Node return shape

Nodes return a subset of `NodeResult`. See [Nodes](./03-nodes.md#node-return-values) for the full return contract and how returned `data` is passed to the next node.

```ts
return {
  data: { key: "value" },
  ui: { message: "Rendered to user" },
  condition: "support.answer",
  intent: "optional-routing-token",
  transitionTo: "another-workflow-id",
};
```

Important fields in practice:

- `data`: merged into runtime state and forwarded as future input
- `ui.message`: emitted as a final message event
- `ui.structured`: emitted as `structured-data`
- `condition` / `intent`: used for conditional edge routing
- `transitionTo`: triggers workflow handoff

## Node behavior currently implemented

From `WorkflowNodeBehavior` and runtime code:

- `behavior.retry.maxAttempts`
- `behavior.retry.delayMs`
- `behavior.checkpoint`

Note: `onError.mode` exists in schema types but is not currently applied by the execution graph compiler.

## Validation

You can validate directly:

```ts
import { validateWorkflow } from "kortyx";

const result = validateWorkflow(candidate);
if (!result.ok) {
  console.error(result.errors);
}
```
