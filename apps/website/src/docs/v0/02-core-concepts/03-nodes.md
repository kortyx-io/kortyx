---
id: v0-nodes
title: "Nodes"
description: "Understand Kortyx nodes, input flow, params, state handoff, and node return values."
keywords: [kortyx, nodes, node-input, node-params, node-result, workflow-state]
sidebar_label: "Nodes"
---
# Nodes

A node is one executable step in a workflow.

Use nodes for the units of work you want Kortyx to orchestrate: classify a message, call a model with `useReason(...)`, fetch data from your app, ask a human for input, route to another branch, or produce the final response.

Each workflow node has two parts:

- a workflow definition entry, where you choose the handler and static `params`
- a node function, where your app code receives `input` and `params`, then returns a `NodeResult`

```ts
import { useReason, type NodeResult } from "kortyx";
import { google } from "@/lib/providers";

type ChatParams = {
  model: ReturnType<typeof google>;
  tone: "concise" | "detailed";
};

export async function answerNode({
  input,
  params,
}: {
  input: { message?: string; topic?: string };
  params: ChatParams;
}): Promise<NodeResult> {
  const result = await useReason({
    model: params.model,
    input: `Answer in a ${params.tone} style: ${input.message ?? ""}`,
    stream: false,
    emit: false,
  });

  return {
    data: { answer: result.text },
    ui: { message: result.text },
  };
}
```
```js
import { useReason } from "kortyx";

export async function answerNode({ input, params }) {
  const result = await useReason({
    model: params.model,
    input: `Answer in a ${params.tone} style: ${input.message ?? ""}`,
    stream: false,
    emit: false,
  });

  return {
    data: { answer: result.text },
    ui: { message: result.text },
  };
}
```

## Where nodes are declared

Nodes are declared inside `defineWorkflow(...)`.

```ts
import { defineWorkflow } from "kortyx";
import { google } from "@/lib/providers";
import { classifyNode } from "@/nodes/classify.node";
import { answerNode } from "@/nodes/answer.node";

export const supportWorkflow = defineWorkflow({
  id: "support",
  version: "1.0.0",
  nodes: {
    classify: {
      run: classifyNode,
      params: {
        model: google("gemini-2.5-flash"),
        labels: ["billing", "technical", "sales"],
      },
    },
    answer: {
      run: answerNode,
      params: {
        model: google("gemini-2.5-flash"),
        tone: "concise",
      },
    },
  },
  edges: [
    ["__start__", "classify"],
    ["classify", "answer"],
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
  nodes: {
    classify: {
      run: classifyNode,
      params: {
        model: google("gemini-2.5-flash"),
        labels: ["billing", "technical", "sales"],
      },
    },
    answer: {
      run: answerNode,
      params: {
        model: google("gemini-2.5-flash"),
        tone: "concise",
      },
    },
  },
  edges: [
    ["__start__", "classify"],
    ["classify", "answer"],
    ["answer", "__end__"],
  ],
});
```

Node definition fields:

- `run`: the node handler. Use a direct function in TypeScript workflows, or a module path / registry key for YAML and JSON workflows.
- `params`: static configuration passed to that node every time it runs.
- `metadata`: app-defined metadata for tooling, docs, or inspection.
- `behavior.retry.maxAttempts`: number of attempts for this node.
- `behavior.retry.delayMs`: delay between retries.

> **Good to know:** `params` are not the user message. They are static per-node configuration from the workflow definition. Use them for model refs, prompt settings, feature flags, limits, tool config, or app-specific constants.

## How client messages reach a node

In the normal chat path, the client sends `messages` to your route, and your route passes them to `agent.streamChat(...)`.

```ts
import { parseChatRequestBody, toSSE } from "kortyx";
import { agent } from "@/lib/agent";

export async function POST(request: Request): Promise<Response> {
  const body = parseChatRequestBody(await request.json());
  const stream = await agent.streamChat(body.messages, {
    sessionId: body.sessionId,
    workflowId: body.workflowId,
    context: body.context,
  });

  return toSSE(stream);
}
```
```js
import { parseChatRequestBody, toSSE } from "kortyx";
import { agent } from "@/lib/agent";

export async function POST(request) {
  const body = parseChatRequestBody(await request.json());
  const stream = await agent.streamChat(body.messages, {
    sessionId: body.sessionId,
    workflowId: body.workflowId,
    context: body.context,
  });

  return toSSE(stream);
}
```

From there, Kortyx does this:

1. Validates the request body.
2. Finds the latest non-empty `user` message.
3. Stores that message content as the initial workflow `input`.
4. Selects the workflow.
5. Runs the first node connected from `__start__`.
6. Calls that node as `node({ input: state.input, params: node.params ?? {} })`.

For this request:

```json
{
  "messages": [
    { "role": "user", "content": "How do I reset billing access?" }
  ]
}
```

The first node receives:

```ts
export async function classifyNode({
  input,
  params,
}: {
  input: string;
  params: Record<string, unknown>;
}) {
  // input is "How do I reset billing access?"
  // params are the params from workflow.nodes.classify.params
}
```
```js
export async function classifyNode({ input, params }) {
  // input is "How do I reset billing access?"
  // params are the params from workflow.nodes.classify.params
}
```

> **Good to know:** Previous chat messages are preserved in runtime state as prior messages for orchestration context. The `input` argument passed to the first node is the latest user message content, not the full message array.

Request `context` is runtime configuration for the run. It does not become node `params`, and it does not replace the initial node `input`. Read it with [Runtime Context](./08-runtime-context.md) when node code needs request metadata.

## How data reaches the next node

Nodes pass data forward by returning `data`.

```ts
export async function classifyNode({
  input,
  params,
}: {
  input: string;
  params: Record<string, unknown>;
}) {
  return {
    data: {
      message: input,
      topic: "billing",
      priority: "normal",
    },
  };
}
```
```js
export async function classifyNode({ input, params }) {
  return {
    data: {
      message: input,
      topic: "billing",
      priority: "normal",
    },
  };
}
```

Kortyx merges returned `data` into workflow state before the next node runs:

- `state.input` becomes the next node's `input`
- `state.data` keeps an accumulated data view for the run
- object fields are deep-merged
- arrays are overwritten, not concatenated
- if the previous `input` was not an object, it is preserved as `rawInput`

After the `classifyNode` return above, the next node receives:

```ts
export async function answerNode({
  input,
  params,
}: {
  input: {
    rawInput: string;
    message: string;
    topic: string;
    priority: string;
  };
  params: Record<string, unknown>;
}) {
  // input is:
  // {
  //   rawInput: "How do I reset billing access?",
  //   message: "How do I reset billing access?",
  //   topic: "billing",
  //   priority: "normal"
  // }
}
```
```js
export async function answerNode({ input, params }) {
  // input is:
  // {
  //   rawInput: "How do I reset billing access?",
  //   message: "How do I reset billing access?",
  //   topic: "billing",
  //   priority: "normal"
  // }
}
```

If a node does not return `data`, the next node sees the existing `input` unchanged.

## Node return values

A node returns a `NodeResult`. All fields are optional.

```ts
return {
  data: { topic: "billing" },
  ui: {
    message: "I can help with billing access.",
    structured: { topic: "billing", priority: "normal" },
  },
  condition: "billing",
  intent: "answer",
  transitionTo: "billing-workflow",
  infra: {
    runtime: { flags: { sawBillingQuestion: true } },
    debug: { classifier: "rules-v1" },
  },
};
```
```js
return {
  data: { topic: "billing" },
  ui: {
    message: "I can help with billing access.",
    structured: { topic: "billing", priority: "normal" },
  },
  condition: "billing",
  intent: "answer",
  transitionTo: "billing-workflow",
  infra: {
    runtime: { flags: { sawBillingQuestion: true } },
    debug: { classifier: "rules-v1" },
  },
};
```

Return fields:

| Field | What it does |
| --- | --- |
| `data` | Deep-merged into `state.input` and `state.data`; this is the main way to pass data to the next node. |
| `ui.message` | Emits a final `message` stream chunk and is stored in conversation history. Use this for assistant text the client should show as a message. |
| `ui.structured` | Merged into `state.ui.structured` and emitted as structured data for UI rendering. |
| `condition` | Stores a routing token in `state.lastCondition`; conditional edges match this against `edge.when`. |
| `intent` | Stores a routing token in `state.lastIntent`; conditional edges use it when `condition` is not set. |
| `transitionTo` | Emits a transition to another workflow id and passes `data` as the transition payload. |
| `infra.runtime` | Deep-merged into runtime state. Hooks such as `useReason(...)` also use runtime state for checkpoints and resume behavior. |
| `infra.config` | Advanced/internal metadata slot. It is accepted by the schema but not applied to graph config by the current runtime. |
| `infra.checkpoint` | Advanced/internal metadata slot for checkpoint-related information. |
| `infra.toolResults` | Advanced/internal metadata slot for tool execution details. |
| `infra.debug` | Advanced/internal metadata slot for diagnostics. |
| `next` | Reserved in the core type. Current routing is controlled by workflow edges, `condition`, `intent`, and `transitionTo`. |

Prefer `data` for node-to-node handoff, `ui` for client-visible output, and `condition` / `intent` for graph routing.

## Routing from a node

Use `condition` when the node chooses between outgoing edges.

```ts
export async function classifyNode({
  input,
  params,
}: {
  input: string;
  params: Record<string, unknown>;
}) {
  const topic = String(input).toLowerCase().includes("billing")
    ? "billing"
    : "general";

  return {
    condition: topic,
    data: { message: input, topic },
  };
}
```
```js
export async function classifyNode({ input, params }) {
  const topic = String(input).toLowerCase().includes("billing")
    ? "billing"
    : "general";

  return {
    condition: topic,
    data: { message: input, topic },
  };
}
```

Then match that token in workflow edges.

```ts
edges: [
  ["__start__", "classify"],
  ["classify", "billingAnswer", { when: "billing" }],
  ["classify", "generalAnswer", { when: "general" }],
  ["billingAnswer", "__end__"],
  ["generalAnswer", "__end__"],
]
```
```js
edges: [
  ["__start__", "classify"],
  ["classify", "billingAnswer", { when: "billing" }],
  ["classify", "generalAnswer", { when: "general" }],
  ["billingAnswer", "__end__"],
  ["generalAnswer", "__end__"],
]
```

See [Conditional Routing](./04-conditional-routing.md) for loops, fallback behavior, and workflow transitions.

## What to read next

- [Define Workflows](./01-define-workflows.md) for the full workflow shape
- [Conditional Routing](./04-conditional-routing.md) for edge matching
- [Hooks](./07-hooks.md) for `useReason(...)`, interrupts, and runtime state
- [Runtime Context](./08-runtime-context.md) for request metadata in nodes
- [Node Resolution](../05-reference/05-node-resolution.md) for `run` strings, module paths, and registry keys
