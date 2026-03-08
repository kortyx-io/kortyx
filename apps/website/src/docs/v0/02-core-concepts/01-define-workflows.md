---
id: v0-define-workflows
title: "Define Workflows"
description: "Define type-safe workflows and node behavior with Kortyx core contracts."
keywords: [kortyx, defineWorkflow, workflow-schema, node-result]
sidebar_label: "Define Workflows"
---
# Define Workflows

The core contract lives in `@kortyx/core` and is exposed through `kortyx`.

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

## Node return shape

Nodes return a subset of `NodeResult`:

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
