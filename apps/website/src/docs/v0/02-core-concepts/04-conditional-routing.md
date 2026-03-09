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
