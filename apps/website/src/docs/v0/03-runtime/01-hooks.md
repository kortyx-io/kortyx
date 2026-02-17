---
id: v0-runtime-hooks
title: "Hooks"
description: "Use Kortyx hooks for reasoning, interrupts, memory access, structured data, and runtime state."
keywords: [kortyx, hooks, useReason, useInterrupt, useWorkflowState, useNodeState]
sidebar_label: "Hooks"
---
# Hooks

Hooks are the public node-level runtime API (import from `kortyx`).

## `useAiProvider(modelId?)`

```ts
import { useAiProvider } from "kortyx";

export const answerNode = async ({ input }: { input: unknown }) => {
  const model = useAiProvider("google:gemini-2.5-flash");

  const res = await model.call({
    prompt: String(input ?? ""),
    system: "Be concise.",
    temperature: 0.2,
  });

  return { ui: { message: res.text } };
};
```

Current behavior:

- provider/model defaults are read from node config or fallback defaults
- internally calls `ctx.speak(...)`
- returns `{ text: string }`

## `useInterrupt({ request, ...schemas })`

```ts
import { useInterrupt } from "kortyx";

const selected = await useInterrupt({
  request: {
    kind: "choice",
    question: "Pick one",
    options: [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
    ],
  },
});
```

Supported input kinds:

- `text`
- `choice`
- `multi-choice`

Return:

- `string` for `text` and `choice`
- `string[]` for `multi-choice`

## `useAiMemory()`

Returns the configured `MemoryAdapter`. If none is configured, it throws.

```ts
const memory = useAiMemory();
await memory.save("session-1", state);
```

## `useNodeState` and `useWorkflowState`

Node-local state:

```ts
const [idx, setIdx] = useNodeState(0);
```

Or keyed node-local state:

```ts
const [cursor, setCursor] = useNodeState("cursor", 0);
```

Workflow-shared state:

```ts
const [todos, setTodos] = useWorkflowState<string[]>("todos", []);
```

## `useEmit()` and `useStructuredData(...)`

```ts
const emit = useEmit();
emit("status", { message: "working" });

useStructuredData({
  dataType: "hooks",
  data: { step: "parse" },
});
```

`useStructuredData` emits `structured_data` from the current node context.
