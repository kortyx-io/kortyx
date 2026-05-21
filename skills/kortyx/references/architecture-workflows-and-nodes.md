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
import { google, useReason } from "kortyx";

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
