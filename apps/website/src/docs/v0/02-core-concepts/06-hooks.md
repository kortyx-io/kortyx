---
id: v0-runtime-hooks
title: "Hooks"
description: "Practical guide to when each hook is useful and what problem it solves in real node logic."
keywords: [kortyx, hooks, useReason, useInterrupt, useWorkflowState, useNodeState, useStructuredData]
sidebar_label: "Hooks"
---
# Hooks

Hooks are the public node-level runtime API (import from `kortyx`).

Use them for five things:

- run model reasoning
- pause for human input
- keep short-lived runtime state
- emit structured UI payloads
- access your configured memory adapter

## Quick Selection

- Need an LLM call in a node: `useReason(...)`
- Need manual human-in-the-loop input: `useInterrupt(...)`
- Need state local to one node execution flow: `useNodeState(...)`
- Need state shared across nodes in the same run: `useWorkflowState(...)`
- Need UI-ready structured events in stream: `useStructuredData(...)`
- Need app-managed persistence APIs: `useAiMemory()`

## `useReason(...)`

Use this for the main model call in a node.

Typical use:

- schema-constrained outputs
- optional interrupt flow (`interrupt`)
- structured stream payloads (`structured`)

```ts
import { useReason } from "kortyx";
import { z } from "zod";
import { google } from "@/lib/providers";

const PlanSchema = z.object({
  summary: z.string(),
  checklist: z.array(z.string()),
  userChoice: z.string(),
});

const ChoiceRequestSchema = z.object({
  kind: z.enum(["choice", "multi-choice"]),
  question: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string() })).min(2),
});

const ChoiceResponseSchema = z.union([
  z.string(),
  z.array(z.string()).min(1),
]);

const result = await useReason({
  id: "launch-plan",
  model: google("gemini-2.5-flash"),
  input: "Plan a one-week launch.",
  outputSchema: PlanSchema,
  structured: { // optional
    dataType: "reason.plan",
    stream: "patch",
    schemaId: "reason-plan",
    schemaVersion: "1",
  },
  interrupt: { // optional
    requestSchema: ChoiceRequestSchema,
    responseSchema: ChoiceResponseSchema,
    schemaId: "reason-choice",
    schemaVersion: "1",
  },
});
```

```js
import { useReason } from "kortyx";
import { z } from "zod";
import { google } from "@/lib/providers";

const PlanSchema = z.object({
  summary: z.string(),
  checklist: z.array(z.string()),
  userChoice: z.string(),
});

const ChoiceRequestSchema = z.object({
  kind: z.enum(["choice", "multi-choice"]),
  question: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string() })).min(2),
});

const ChoiceResponseSchema = z.union([
  z.string(),
  z.array(z.string()).min(1),
]);

const result = await useReason({
  id: "launch-plan",
  model: google("gemini-2.5-flash"),
  input: "Plan a one-week launch.",
  outputSchema: PlanSchema,
  structured: { // optional
    dataType: "reason.plan",
    stream: "patch",
    schemaId: "reason-plan",
    schemaVersion: "1",
  },
  interrupt: { // optional
    requestSchema: ChoiceRequestSchema,
    responseSchema: ChoiceResponseSchema,
    schemaId: "reason-choice",
    schemaVersion: "1",
  },
});
```

Behavior:

- First pass is a single model call that produces draft output and interrupt request.
- Runtime emits `interrupt` and pauses.
- Resume continues from the `useReason` checkpoint and runs the continuation pass.

Optional blocks and guarantees:

- `structured` is optional.
- `interrupt` is optional.
- If `interrupt` is provided, `useReason` always runs interrupt mode. It is not model-optional.
- The model still needs to return schema-valid JSON for that mode; if it does not, `useReason` throws a validation error.
- If `structured` is provided, runtime emits structured stream payloads when valid structured output is available (typically with `outputSchema`).

## `useInterrupt({ request, ...schemas })`

Use this when you want fully manual interrupt payloads without LLM-generated request shaping.

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

```js
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

Return:

- `string` for `text` and `choice`
- `string[]` for `multi-choice`

## `useNodeState` and `useWorkflowState`

Node-local state:

```ts
const [idx, setIdx] = useNodeState(0);
```

```js
const [idx, setIdx] = useNodeState(0);
```

Workflow-shared state:

```ts
const [todos, setTodos] = useWorkflowState<string[]>("todos", []);
```

```js
const [todos, setTodos] = useWorkflowState("todos", []);
```

## State Lifetime and Limits

`useNodeState`:

- Persists for repeated executions of the same node inside one run (retries, direct self-loops, interrupt resume replay).
- Is node-local only; do not treat it as cross-node shared state.

`useWorkflowState`:

- Persists across nodes and workflow transitions within the same run.
- Restores on interrupt resume for that run.

Across messages/sessions:

- Hook state is not a long-term session store. A new `processChat` request starts a new run with fresh hook state.
- For cross-request persistence, use your own storage via `useAiMemory()` or app-level data stores.

Durability and practical limits:

- Hook state is tied to runtime checkpoint persistence.
- In-memory framework adapter is process-local and not restart-safe.
- Redis framework adapter can restore across restarts until TTL expiry (`KORTYX_FRAMEWORK_TTL_MS` / adapter `ttlMs`).
- Keep hook state small and JSON-serializable; large objects increase checkpoint size and resume cost.

Practical guideline:

- use hook state for runtime flow control
- use `useAiMemory()` (or your own DB) for data that must survive across requests/users

## `useStructuredData(...)`

```ts
useStructuredData({
  dataType: "hooks",
  mode: "patch",
  data: { step: "parse" },
});
```

```js
useStructuredData({
  dataType: "hooks",
  mode: "patch",
  data: { step: "parse" },
});
```

`useStructuredData` emits `structured_data` from the current node context for UI consumption.

## `useAiMemory()`

Returns the configured `MemoryAdapter`. If none is configured, it throws.

```ts
const memory = useAiMemory();
await memory.save("session-1", state);
```

```js
const memory = useAiMemory();
await memory.save("session-1", state);
```

> **Good to know:** On resume, node code starts again from the top. `useReason` continues from its internal checkpoint, but code before `useReason` can run again. Keep `useReason` as the first meaningful operation and guard pre-`useReason` side effects with `useNodeState`.

```ts
const [started, setStarted] = useNodeState(false);

if (!started) {
  useStructuredData({ dataType: "lifecycle", mode: "snapshot", data: { step: "start" } });
  setStarted(true);
}

const result = await useReason({ ... });
setStarted(false);
```

```js
const [started, setStarted] = useNodeState(false);

if (!started) {
  useStructuredData({ dataType: "lifecycle", mode: "snapshot", data: { step: "start" } });
  setStarted(true);
}

const result = await useReason({ ... });
setStarted(false);
```
