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
- Need request metadata inside a node: `useRuntimeContext(...)`
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

### Emission vs `ui.message`

`emit` controls whether `useReason(...)` publishes model output into the stream while the model is running. `ui.message` is a node return value that emits a final message after the node finishes.

Do not return `ui: { message: result.text }` from the same node when `useReason({ emit: true })` already streams the answer. That sends the same assistant text through two channels.

Use one of these patterns:

| Use case | Pattern |
| --- | --- |
| Live streamed answer | `useReason({ stream: true, emit: true })`, then return `data` only |
| Final-only answer | `useReason({ stream: false, emit: false })`, then return `ui.message` |
| Internal reasoning | `useReason({ emit: false })`, then return `data` unless the result should be shown |
| Custom final note | Return `ui.message` only when it is intentionally different from streamed model text |

```ts
const result = await useReason({
  id: "answer",
  model: google("gemini-2.5-flash"),
  input: String(input ?? ""),
  stream: true,
  emit: true,
});

return {
  data: { answer: result.text },
};
```
```js
const result = await useReason({
  id: "answer",
  model: google("gemini-2.5-flash"),
  input: String(input ?? ""),
  stream: true,
  emit: true,
});

return {
  data: { answer: result.text },
};
```

> **Good to know:** Return `data` for values later nodes need. Return `ui.message` only for assistant text the client should receive as a final message chunk.

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

### What `useReason(...)` returns

`useReason(...)` returns more than final text. You can also inspect normalized provider metadata:

```ts
const result = await useReason({
  model: google("gemini-2.5-flash"),
  input: "Write a short beta launch email for customers.",
});

result.text;
result.output;
result.raw;
result.usage;
result.finishReason;
result.providerMetadata;
result.warnings;
result.interruptResponse;
```
```js
const result = await useReason({
  model: google("gemini-2.5-flash"),
  input: "Write a short beta launch email for customers.",
});

result.text;
result.output;
result.raw;
result.usage;
result.finishReason;
result.providerMetadata;
result.warnings;
result.interruptResponse;
```

What each field means:

- `text`: final assistant text
- `output`: parsed and validated object when `outputSchema` succeeds
- `raw`: provider-native payload for debugging
- `usage`: normalized token usage when the provider exposes it
- `finishReason`: normalized stop reason
- `providerMetadata`: provider-specific metadata that does not fit the shared top-level contract
- `warnings`: compatibility or unsupported-feature warnings surfaced by the provider
- `interruptResponse`: final human response when you use interrupt mode

> **Good to know:** In interrupt flows, Kortyx aggregates `usage`, `warnings`, and `providerMetadata` across the first pass and continuation pass. Runtime token usage is also accumulated into `state.runtime.tokenUsage`.

### Common model call options

These are the main cross-provider options you can pass to `useReason(...)`:

```ts
const abortController = new AbortController();

const result = await useReason({
  model: google("gemini-2.5-flash"),
  input: "Summarize this changelog.",
  temperature: 0.2,
  maxOutputTokens: 600,
  stopSequences: ["</final>"],
  abortSignal: abortController.signal,
  reasoning: {
    effort: "medium",
    maxTokens: 256,
  },
  responseFormat: { type: "json" },
  providerOptions: {},
});
```
```js
const abortController = new AbortController();

const result = await useReason({
  model: google("gemini-2.5-flash"),
  input: "Summarize this changelog.",
  temperature: 0.2,
  maxOutputTokens: 600,
  stopSequences: ["</final>"],
  abortSignal: abortController.signal,
  reasoning: {
    effort: "medium",
    maxTokens: 256,
  },
  responseFormat: { type: "json" },
  providerOptions: {},
});
```

If a provider cannot fully support one of these generic options yet, it should surface a warning instead of silently ignoring it.

### MCP tools

Use MCP tools when an external MCP server should participate in one `useReason(...)` call. Create the MCP client, list the tools, then pass those tools to `useReason`.

```ts tabs="mcp-tools" tab="TypeScript"
import { createMCPClient, useReason } from "kortyx";
import { openai } from "@/lib/providers";

const mcpClient = await createMCPClient({
  transport: {
    type: "http",
    url: "https://your-server.com/mcp",
  },
});

const tools = await mcpClient.tools({
  include: ["search_issues", "get_issue"],
});

const result = await useReason({
  model: openai("gpt-4.1-mini"),
  input: "Find recent open bugs and summarize the top risks.",
  tools,
  toolPolicy: {
    maxSteps: 5,
    approval: false,
    emit: true,
  },
});
```
```js tabs="mcp-tools" tab="JavaScript"
import { createMCPClient, useReason } from "kortyx";
import { openai } from "@/lib/providers";

const mcpClient = await createMCPClient({
  transport: {
    type: "http",
    url: "https://your-server.com/mcp",
  },
});

const tools = await mcpClient.tools({
  include: ["search_issues", "get_issue"],
});

const result = await useReason({
  model: openai("gpt-4.1-mini"),
  input: "Find recent open bugs and summarize the top risks.",
  tools,
  toolPolicy: {
    maxSteps: 5,
    approval: false,
    emit: true,
  },
});
```

What happens:

- Kortyx sends MCP tool schemas to the provider.
- If the model requests a tool, Kortyx calls the MCP server and feeds the result back to the next model step.
- `toolPolicy.maxSteps` limits the number of model passes inside the tool loop.
- `toolPolicy.approval: true` uses Kortyx interrupts before executing a tool call.
- `toolPolicy.emit: true` emits tool lifecycle chunks in the stream.

Tools returned by `mcpClient.tools()` are request-scoped by default. `useReason(...)` closes the underlying MCP client when the call finishes, errors, or interrupts. Use `mcpClient.tools({ closeAfterUse: false })` only for long-lived server processes where you close the client manually.

> **Good to know:** MCP tool calling requires provider adapter support for native tool calls. `@kortyx/openai`, `@kortyx/google`, `@kortyx/anthropic`, `@kortyx/deepseek`, `@kortyx/groq`, and `@kortyx/mistral` implement the shared tool contracts.

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

- `set` field paths
- string field paths as `text-delta`
- array field paths as `append`
- non-interrupt flows only

That means:

- dotted paths such as `draft.body` or `table.rows` can be used by `useReason(... structured.fields ...)`
- numeric path segments can target array indexes, such as `sections.0.body`
- `*` matches one object key or array index segment, such as `assessment_points.*.criteria_label`
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
  id: "pick-one",
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
  id: "pick-one",
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

Use stable `id` values for interrupts in nodes that can replay or contain multiple interrupt calls.

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

## `useRuntimeContext(...)`

Use this when node code needs request metadata passed from the route, such as selected thread id, locale, or server-approved auth context.

```ts
import { useRuntimeContext } from "kortyx";

type AppContext = {
  threadId?: string;
  userId: string;
};

const context = useRuntimeContext<AppContext>();
```
```js
import { useRuntimeContext } from "kortyx";

const context = useRuntimeContext();
```

See [Runtime Context](./08-runtime-context.md) for the full client-to-route-to-node flow and security boundary.

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

In `useStructuredData(...)`, `path` uses dot notation such as `table.rows` or `draft.body`. `append` should target an array field, and `text-delta` should target a string field. `useReason(... structured.fields ...)` supports the same nested path notation plus single-segment `*` patterns for model-generated keys.

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

const result = await useReason({
  id: "resume-safe-step",
  model,
  input,
});
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

const result = await useReason({
  id: "resume-safe-step",
  model,
  input,
});
setStarted(false);
```

For chunk shapes and recommended client reducers, see [Stream Protocol](../05-reference/03-stream-protocol.md).
