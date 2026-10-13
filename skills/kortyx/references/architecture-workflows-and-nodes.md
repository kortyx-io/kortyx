# Workflows And Nodes

Workflows define graph topology. Nodes contain executable business/model logic.

## Minimal Workflow

```ts
import { defineWorkflow } from "kortyx";
import { chatNode } from "@/nodes/chat.node";

export const generalChatWorkflow = defineWorkflow({
  id: "general-chat",
  version: "1.0.0",
  description: "Single-node chat workflow.",
  nodes: {
    chat: {
      run: chatNode,
      params: {
        temperature: 0.3,
      },
    },
  },
  edges: [
    ["__start__", "chat"],
    ["chat", "__end__"],
  ],
});
```

## Node Shape

Node functions receive `{ input, params }`.

```ts
import { google } from "@kortyx/google";
import { useReason } from "kortyx";

type ChatParams = {
  temperature?: number;
};

export const chatNode = async ({
  input,
  params,
}: {
  input: unknown;
  params: ChatParams;
}) => {
  const result = await useReason({
    id: "chat",
    model: google("gemini-2.5-flash"),
    input: String(input ?? ""),
    temperature: params.temperature ?? 0.3,
    stream: true,
    emit: true,
  });

  return {
    data: {
      text: result.text,
    },
  };
};
```

## Return Shape

Return only the fields you need:

```ts
return {
  data: { key: "value" },
  condition: "needs-review",
  intent: "optional-routing-token",
  transitionTo: "another-workflow-id",
  ui: { message: "Only when a final message chunk is desired" },
};
```

Fields:

- `data`: merged into workflow state and forwarded as future node input.
- `condition`: primary routing token for conditional edges.
- `intent`: secondary routing token when no matching condition is present.
- `transitionTo`: hand off to another workflow id.
- `ui.message`: emits a client `message` chunk; avoid duplicating text already emitted by `useReason({ emit: true })`.
- `ui.structured`: emits a final `structured-data` chunk; prefer `useStructuredData(...)` for explicit structured streaming.

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

## Edges And Routing

Use unconditional edges for straight-line flows:

```ts
edges: [
  ["__start__", "classify"],
  ["classify", "answer"],
  ["answer", "__end__"],
];
```

Use `when` for conditional branches:

```ts
edges: [
  ["route", "askChoice", { when: "choice" }],
  ["route", "askText", { when: "text" }],
];
```

Return the matching condition from the source node:

```ts
return {
  condition: mode,
  data: { mode },
};
```

## Calls That Return

Use `useWorkflow(...)` in a node or custom hook when a registered workflow should return data and the parent should continue. Define child input/output schemas and return ordinary node `data` at `__end__`. No call edge or special return node is required.

Read [Child Workflow Implementation](./hooks-child-workflows.md) for typed string IDs, direct references, registration, and migration from `transitionTo`.

## Retry Behavior

Attach retry behavior at the workflow node definition:

```ts
nodes: {
  classify: {
    run: classifyNode,
    behavior: {
      retry: { maxAttempts: 2, delayMs: 200 },
    },
  },
}
```

Keep retries for transient failures. Do not use retries to hide deterministic validation or auth errors.

## Agent Wiring

```ts
import { createAgent } from "kortyx";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";

export const agent = createAgent({
  workflows: [generalChatWorkflow],
  defaultWorkflowId: "general-chat",
});
```

`createAgent(...)` can also load from `workflowsDir` or a custom `workflowRegistry`, but pass only one workflow source.

## Validation

Use `validateWorkflow(...)` when generating or accepting workflow definitions dynamically.

```ts
import { validateWorkflow } from "kortyx";

const result = validateWorkflow(candidate);
if (!result.ok) {
  throw new Error(result.errors.map((error) => error.message).join("\n"));
}
```

## Rules

- Keep node functions focused; move app database/API work into services.
- Use `params` for node configuration, not request-specific user input.
- Use `data` for values later nodes need.
- Use `ui.message` only for intentional client-visible final messages.
- Prefer stable node ids and stable `useReason` / `useInterrupt` ids in replayable flows.
