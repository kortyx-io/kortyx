---
id: v0-conditional-routing
title: "Conditional Routing"
description: "Route between workflow nodes with condition tokens, edge matching, loops, and transitions."
keywords: [kortyx, conditional-routing, edges, condition, transition]
sidebar_label: "Conditional Routing"
---
# Conditional Routing

Conditional routing is driven by edge `when` values and node return values.

## Edge syntax

```ts
edges: [
  ["route", "askChoice", { when: "choice" }],
  ["route", "askMulti", { when: "multi" }],
  ["route", "askText", { when: "text" }],
]
```

## Node return

```ts
return {
  condition: "multi",
  data: { mode: "multi" },
};
```

Execution routing matches in this order:

1. `state.lastCondition`
2. `state.lastIntent`

If no condition matches for that conditional group, runtime falls back to an internal `__end__` mapping for that source node.

## Example loop

Define the condition branches on the workflow edges.

```ts
edges: [
  ["todo", "todo", { when: "more" }],
  ["todo", "final", { when: "done" }],
  ["final", "__end__"],
]
```

Return the matching condition from the node.

```ts
return {
  condition: hasMore ? "more" : "done",
  data: { idx: nextIdx },
};
```

## Workflow transition (different from edge routing)

Use `transitionTo` to jump to another workflow id:

```ts
return {
  transitionTo: "general-chat",
  data: { reason: "fallback" },
};
```

The orchestrator emits a `transition` chunk and loads the target workflow with `selectWorkflow`.

## Studio topology visibility

Kortyx Studio uses a hybrid model for workflow-to-workflow edges:

- The canonical path is `kortyx topology push`, usually run in CI or during deploy. This sends declared topology to the Kortyx API before traffic arrives.
- If the SDK can statically understand a `transitionTo` target from node code, the pushed topology can show that edge before the transition has ever run.
- If the target is computed dynamically, Studio still records the edge after the transition happens at runtime.

For local development:

```bash
kortyx topology push --entry src/lib/agent.ts
```

For CI/deploy:

```bash
kortyx topology push \
  --entry src/lib/agent.ts \
  --environment production \
  --deployment-ref "$GITHUB_SHA"
```

Prefer return shapes where the target workflow id is visible in code:

```ts
return {
  transitionTo: "canvas-save",
  data: { reason: "user_requested_save" },
};
```

Constants are also fine when they map clearly to registered workflow ids:

```ts
return {
  transitionTo: WORKFLOW_IDS.canvasSave,
};
```

Avoid hiding stable workflow topology behind arbitrary runtime logic when the set of targets is known:

```ts
// Works at runtime, but Studio cannot reliably show this edge before it happens.
return {
  transitionTo: await lookupNextWorkflow(input),
};
```

If a transition target is truly dynamic, no extra metadata is required. Studio will show the edge once telemetry observes an actual `transitionTo` event.
