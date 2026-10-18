---
id: v0-define-workflows
title: "Define Workflows"
description: "Define typed Kortyx workflows with nodes, edges, callable child workflows, data reducers, return values, and validation for explicit agent behavior."
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

## Opt-in data reducers

Node `data` continues to deep-merge object fields by default; arrays and scalars
are overwritten. There is no automatic union branch replacement. Use workflow
`reduce` to override individual top-level fields, with callback types inferred
from `z.output<typeof outputSchema>`:

```ts
import { defineWorkflow } from "kortyx";
import { z } from "zod";

const closing = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("offer"), question: z.string() }),
  z.strictObject({ kind: z.literal("none"), reason: z.string() }),
]);

export const workflow = defineWorkflow({
  id: "reply",
  version: "1",
  inputSchema: z.string(),
  outputSchema: z.object({
    closing,
    events: z.array(z.string()),
    note: z.string().optional(),
  }),
  reduce: {
    closing: (_previous, next) => next,
    events: (previous, next) => [...(previous ?? []), ...next],
    note: (_previous, next) => next === "clear" ? undefined : next,
  },
  nodes: {
    reply: { run: () => ({ data: {
      closing: { kind: "none", reason: "answered" },
      events: ["answered"],
    } }) },
  },
  edges: [["__start__", "reply"], ["reply", "__end__"]],
});
```

Reducers run only for explicitly returned fields. Omitted fields retain their
stored values; fields without callbacks keep the existing deep merge. `previous`
is `undefined` when no value is stored. The callback result is stored directly,
without another deep merge; returning `undefined` removes the field from data
and flowing node input.

Callbacks must be synchronous, pure and deterministic: do not mutate arguments,
call hooks, perform I/O or depend on time/randomness. A parallel join can recompute
an accumulated view from raw updates, and replay can execute callbacks again.
Joins fold each visible node's writes once in stable topological order, using
`nodes` declaration order for ties, regardless of completion timing. Shared
ancestors are not counted twice. Conflicting branch fields without reducers still
produce `GRAPH_OUTPUT_CONFLICT`.

The same policy applies across nodes, chat turns and resume. Restoring a saved
snapshot does not reduce its values again. Child workflows use their own reducers;
a parent reducer then sees the child's validated output only when a parent node
returns that field. A child's omitted field does not clear the parent's value.

Reducers require `outputSchema`. Existing output validation remains at completion
boundaries, allowing incomplete intermediate output. Clearing a required field or
returning the wrong type fails with `INVALID_OUTPUT`. A thrown callback or an async
callback supplied by untyped code fails with `WORKFLOW_REDUCER_FAILED` (workflow
category, not retryable), identifying the workflow and field; the original error
is retained as a private cause. No field values or raw exception prose are added
to the public failure.

Use TypeScript/object workflow definitions for callbacks; JSON and YAML cannot
encode functions. Bump the workflow version when changing reducers before
resuming old executions. Existing workflows need no changes; reducer-enabled
workflows require the new core/runtime packages on every execution worker.

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
