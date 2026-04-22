---
id: v0-runtime-hooks
title: "Hooks"
description: "Practical guide to when each hook is useful and how structured streaming works in real node logic."
keywords: [kortyx, hooks, useReason, useInterrupt, useWorkflowState, useNodeState, useStructuredData]
sidebar_label: "Hooks"
---
# Hooks

Hooks are the public node-level runtime API. Import them from `kortyx`.

Use them for four things:

- run model reasoning
- pause for human input
- keep short-lived runtime state
- stream UI-ready structured data

## Quick Selection

- Need an LLM call in a node: `useReason(...)`
- Need manual human-in-the-loop input: `useInterrupt(...)`
- Need state local to one node execution flow: `useNodeState(...)`
- Need state shared across nodes in the same run: `useWorkflowState(...)`
- Need structured UI updates in the stream: `useStructuredData(...)`

## Structured Streaming Mental Model

Think about structured streaming as a second channel beside normal assistant text:

- `text-*` chunks are text you render as text
- `structured-data` chunks are object updates you render as UI state
- `streamId` identifies one logical structured stream
- `kind` tells the client how to apply the update

In practice:

- use `useReason({ structured })` when the model owns the object
- use `useStructuredData(...)` when your node logic owns the updates

## `useReason(...)`

Use this for the main model call in a node.

Typical use:

- schema-constrained outputs
- optional interrupt flow (`interrupt`)
- structured stream payloads (`structured`)

### Example: stream an email draft as JSON

This is the most useful structured-streaming shape:

- one field grows as text
- one field grows as an array
- the full validated object arrives at the end

```ts
import { useReason } from "kortyx";
import { z } from "zod";
import { google } from "@/lib/providers";

const EmailDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
  bullets: z.array(z.string()),
});

const result = await useReason({
  id: "compose-email",
  model: google("gemini-2.5-flash"),
  input: "Write a short beta launch email for customers.",
  outputSchema: EmailDraftSchema,
  structured: {
    dataType: "email.compose",
    schemaId: "email-compose",
    schemaVersion: "1",
    stream: true,
    fields: {
      subject: "set",
      body: "text-delta",
      bullets: "append",
    },
  },
});
```
```js
import { useReason } from "kortyx";
import { z } from "zod";
import { google } from "@/lib/providers";

const EmailDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
  bullets: z.array(z.string()),
});

const result = await useReason({
  id: "compose-email",
  model: google("gemini-2.5-flash"),
  input: "Write a short beta launch email for customers.",
  outputSchema: EmailDraftSchema,
  structured: {
    dataType: "email.compose",
    schemaId: "email-compose",
    schemaVersion: "1",
    stream: true,
    fields: {
      subject: "set",
      body: "text-delta",
      bullets: "append",
    },
  },
});
```

What happens:

- the model still generates one JSON object
- Kortyx watches the streamed JSON
- all incremental updates from that one `useReason(...)` call share one `streamId`
- when `subject` becomes complete, Kortyx emits `structured-data` with `kind: "set"`
- when `body` grows, Kortyx emits `structured-data` with `kind: "text-delta"`
- when `bullets` gains finished items, Kortyx emits `structured-data` with `kind: "append"`
- when the whole object validates, Kortyx emits one `structured-data` chunk with `kind: "final"`

That means a client can start rendering the email body and bullets before the final object arrives.

Fields that are not declared in `structured.fields` are available when the final object arrives.

### Default behavior

If you provide `structured` but do not provide `fields`, `useReason(...)` emits one final structured object when parsing and validation succeed.

That is the default and simplest path:

```ts
const result = await useReason({
  model: google("gemini-2.5-flash"),
  input: "Write a short beta launch email for customers.",
  outputSchema: EmailDraftSchema,
  structured: {
    dataType: "email.compose",
  },
});
```
```js
const result = await useReason({
  model: google("gemini-2.5-flash"),
  input: "Write a short beta launch email for customers.",
  outputSchema: EmailDraftSchema,
  structured: {
    dataType: "email.compose",
  },
});
```

### Current incremental streaming limits

Today, `useReason({ structured })` incremental field streaming supports:

- top-level `set` fields
- top-level string fields as `text-delta`
- top-level array fields as `append`
- non-interrupt flows only

That means:

- dotted paths such as `draft.body` or `table.rows` are not used by `useReason(... structured.fields ...)` incremental extraction today
- empty field keys are rejected
- if you combine `useReason` with `interrupt`, you still get structured output when a valid object exists, but incremental field streaming is not combined with interrupt mode today
- when `outputSchema` or `interrupt` is present, `useReason` suppresses normal assistant text chunk streaming because the runtime is parsing and validating structured output

In practice, expect `structured-data` and `interrupt` events in those cases, not `text-delta`.

> **Good to know:** `useReason(...)` validates the final object against `outputSchema`, but incremental chunks are enforced only at the path and operation level. If you need per-update schema checks before the final object, emit manual `useStructuredData(...)` chunks with `valueSchema`, `itemSchema`, or `dataSchema`.

### When to use `useReason({ structured })`

Use it when:

- the model result itself is the UI object you want to render
- you want the final object validated against `outputSchema`
- a string field or array field should become visible before the full object is done

Use `useStructuredData(...)` instead when:

- the updates come from app logic rather than the model
- you need precise control over when fields are emitted
- you want to emit `set`, `append`, `text-delta`, or `final` directly

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
const [todos, setTodos] = useWorkflowState("todos", []);
```
```js
const [todos, setTodos] = useWorkflowState("todos", []);
```

## State Lifetime and Limits

`useNodeState`:

- persists for repeated executions of the same node inside one run
- is node-local only

`useWorkflowState`:

- persists across nodes and workflow transitions within the same run
- restores on interrupt resume for that run

Across messages and sessions:

- hook state is not a long-term session store
- a new chat request starts a new run with fresh hook state
- for cross-request persistence, call your own DBs or service clients from node code

Durability and practical limits:

- hook state is tied to runtime checkpoint persistence
- in-memory framework adapter is process-local and not restart-safe
- Redis framework adapter can restore across restarts until TTL expiry
- keep hook state small and JSON-serializable

## `useStructuredData(...)`

Use this when your node wants to emit UI updates directly.

The API is intentionally simple:

- `kind: "set"` sets one field at a path
- `kind: "append"` appends items to an array field
- `kind: "text-delta"` appends text to a string field
- `kind: "final"` publishes the completed object

If you omit `kind`, `useStructuredData(...)` defaults to `final`.

### Example: drive an email composer UI yourself

```ts
import { useStructuredData } from "kortyx";

const streamId = "email-compose";

useStructuredData({
  streamId,
  dataType: "email.compose",
  kind: "set",
  path: "subject",
  value: "Beta access is open",
});

useStructuredData({
  streamId,
  dataType: "email.compose",
  kind: "text-delta",
  path: "draft.body",
  delta: "Hi team,\n\n",
});

useStructuredData({
  streamId,
  dataType: "email.compose",
  kind: "append",
  path: "draft.bullets",
  items: ["Faster setup", "Live streaming UI"],
});

useStructuredData({
  streamId,
  dataType: "email.compose",
  data: {
    subject: "Beta access is open",
    draft: {
      body: "Hi team,\n\nBeta access is open.\n",
      bullets: ["Faster setup", "Live streaming UI"],
    },
  },
});
```
```js
import { useStructuredData } from "kortyx";

const streamId = "email-compose";

useStructuredData({
  streamId,
  dataType: "email.compose",
  kind: "set",
  path: "subject",
  value: "Beta access is open",
});

useStructuredData({
  streamId,
  dataType: "email.compose",
  kind: "text-delta",
  path: "draft.body",
  delta: "Hi team,\n\n",
});

useStructuredData({
  streamId,
  dataType: "email.compose",
  kind: "append",
  path: "draft.bullets",
  items: ["Faster setup", "Live streaming UI"],
});

useStructuredData({
  streamId,
  dataType: "email.compose",
  data: {
    subject: "Beta access is open",
    draft: {
      body: "Hi team,\n\nBeta access is open.\n",
      bullets: ["Faster setup", "Live streaming UI"],
    },
  },
});
```

Use this pattern for:

- email or document composers
- tables that gain rows over time
- growing arrays such as job cards or search results
- progress panels and dashboard state

### `streamId` and `id`

- `streamId` is the client-facing identity for one structured stream
- keep it stable across related updates so the client knows which object is being updated
- `id` is optional app metadata you may also want on the chunk

If you do not pass `streamId`, Kortyx generates one. That is fine for one-off `final` payloads, but for multi-step updates you usually want to pass a stable `streamId` yourself.

In `useStructuredData(...)`, `path` uses dot notation such as `table.rows` or `draft.body`. `append` should target an array field, and `text-delta` should target a string field. This nested-path behavior applies to manual structured updates, not to `useReason(... structured.fields ...)` incremental extraction.

Manual structured updates can build nested objects incrementally, but once a path holds a string, number, boolean, or other non-container value, later chunks cannot treat that same location as an object or array.

On resume, node code starts again from the top. `useReason` continues from its internal checkpoint, but code before `useReason` can run again. Keep `useReason` as the first meaningful operation and guard pre-`useReason` side effects with `useNodeState`.

```ts
const [started, setStarted] = useNodeState(false);

if (!started) {
  useStructuredData({
    streamId: "lifecycle",
    dataType: "lifecycle",
    data: { step: "start" },
  });
  setStarted(true);
}

const result = await useReason({ ... });
setStarted(false);
```
```js
const [started, setStarted] = useNodeState(false);

if (!started) {
  useStructuredData({
    streamId: "lifecycle",
    dataType: "lifecycle",
    data: { step: "start" },
  });
  setStarted(true);
}

const result = await useReason({ ... });
setStarted(false);
```

For chunk shapes and recommended client reducers, see [Stream Protocol](../05-reference/03-stream-protocol.md).
