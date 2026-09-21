---
id: v0-runtime-hooks
title: "Hooks"
description: "Practical guide to when each hook is useful and how structured streaming works in real node logic."
keywords: [kortyx, hooks, useTool, useReason, useInterrupt, useWorkflow, createWorkflowHooks, useWorkflowState, useNodeState, useStructuredData]
sidebar_label: "Hooks"
---
# Hooks

Hooks are the public node-level runtime API. Import them from `kortyx`.

Use them to:

- call a registered child workflow and continue with its result
- run model reasoning
- pause for human input
- keep short-lived runtime state
- stream UI-ready structured data

## Quick Selection

- Need a child workflow result before continuing: `useWorkflow(...)`
- Need typed workflow names: `createWorkflowHooks(...)`
- Need direct observable tool execution: `useTool({tool, input})`
- Need an LLM call in a node: `useReason(...)`
- Need manual human-in-the-loop input: `useInterrupt(...)`
- Need state local to one node execution flow: `useNodeState(...)`
- Need state shared across nodes in the same run: `useWorkflowState(...)`
- Need request metadata inside a node: `useRuntimeContext(...)`
- Need structured UI updates in the stream: `useStructuredData(...)`
- Need to record a handled error without stopping execution: `reportError(...)`

## `reportError(error, options?)`

`reportError` records a handled error on the active workflow span without changing
control flow. Use it when the node catches an error and deliberately continues with
a fallback:

```ts
import { reportError } from "kortyx";

try {
  return await loadCandidate(jobId);
} catch (error) {
  reportError(error, {
    severity: "warning",
    tags: ["brief"],
    metadata: { jobId },
  });
  return fallbackCandidate(jobId);
}
```

Do not call `reportError` immediately before rethrowing. Uncaught node errors are
recorded automatically and still stop the workflow after configured retries. A
manual report is marked handled, leaves the active span successful, and is a no-op
when no compatible observer is configured. Observer failures never affect the node.

Studio records bounded exception type, message, stack and cause details with the
active run/workflow/node/trace correlation. Metadata filters credential-shaped
keys, but messages, stacks and free-form values can still contain sensitive text;
keep Studio access-controlled. OpenTelemetry records the exception and a
`kortyx.error.reported` event without setting the span status to error.

## `useTool({tool, input})`

Import `useTool` and `KortyxExecutableTool` from `kortyx` on the server. `useTool`
executes immediately inside a workflow node or custom server hook. It infers input
and result from the executable definition and returns the original result. It
preserves thrown errors. No model call or MCP transport is involved.

Define each tool once, then use the same definition in both paths:

```ts
import { type KortyxExecutableTool, useTool, useReason } from "kortyx";

type LookupResult = { status: "OK"; text: string } | { status: "DENIED" };
const lookup: KortyxExecutableTool<{ jobId: string }, LookupResult> = {
  name: "read_job_knowledge",
  description: "Read permitted job information",
  inputSchema: {
    type: "object",
    properties: { jobId: { type: "string" } },
    required: ["jobId"],
  },
  outcomes: {
    denialCodes: ["JOB_INFORMATION_UNAVAILABLE"],
    classifyResult: result => result.status === "DENIED"
      ? { outcome: "denied", code: "JOB_INFORMATION_UNAVAILABLE" }
      : { outcome: "success" },
  },
  execute: async ({ jobId }) => applicationOwnedLookup(jobId),
};

// Application code supplies arguments explicitly.
const result = await useTool({ tool: lookup, input: { jobId } });

// The model selects tools and supplies arguments from their advertised schemas.
const reason = await useReason({ model, input: "Read this job", tools: [lookup] });
```

Permission enforcement and input validation remain inside the application's tool.
`inputSchema` advertises model arguments; it is not an automatic local validator.
`outcomes` classifies observations without changing returned values, throwing a
new exception, granting permissions, or controlling retries. `classifyError` may
map an application error to a denial; the original exception still propagates
from `useTool`. Throwing classifiers cannot affect execution. Without a mapper,
returned values succeed, thrown errors and `isError: true` tool results are faults.
Cancellation is runtime-owned and cannot be reclassified.

Denial codes are explicit allowlisted identifiers: uppercase letters, digits and
underscores, beginning with a letter, up to 64 characters. Unsafe or unapproved
codes become `DENIED`. Do not encode user data in tool names, descriptions or codes.

`useTool({tool, input, id?, abortSignal?})` inherits the workflow signal and tool-call
budget. IDs are generated; a stable optional `id` is useful when conditional hook
order changes. Tools receive `{toolCallId, abortSignal?}` as their second argument.
Separate executions receive separate attempt IDs. A native adapter that delegates
its same named call and unchanged input object to `useTool` adopts the native
observation; distinct nested tools have their own child observation.

Direct calls are **not cached**. A node restarts from the top after interruption,
so direct side effects before the interrupt may run again. Keep retries and
idempotency application-owned. Completed native `useReason` results and completed
child workflow calls are cached by their existing checkpoints. Studio marks these
as cached reuse, links the original scope, and does not count them as executions.
Old checkpoints predating tool observations cannot reconstruct historical facts.

`close` defaults to request ownership; `closeAfterUse: false` preserves shared
resources. Direct calls close their owned resource after the call. `useReason`
closes the supplied resources once across every exit, including cached replay,
setup failure and cancellation. Cleanup failure is a best-effort diagnostic and
cannot turn a committed side effect into a retry. Wrappers must forward ownership
and cleanup from their underlying resource.

With telemetry configured, Studio shows tool names, calling mode, duration and
success/denial/fault/cancellation separately. Tools are attached capabilities of
nodes, not control-flow nodes. `kortyx topology push` discovers statically resolvable
attachments without executing tool/MCP factories or workflow nodes. Dynamic
attachments are marked unresolved and become observed after real execution. The
CLI still imports the configured entry to obtain workflow definitions; keep that
entry's top-level initialization safe.

Tool observations exclude raw input/result/errors and credentials. Request context
is not copied wholesale into telemetry. Explicit app telemetry metadata is opt-in;
credential-shaped fields are filtered, but free text cannot be automatically made
safe. Telemetry delivery and observer callback failures never change execution.

## `useWorkflow(...)`

Await a registered child workflow from a node or custom hook, then use its validated `result.data`. Use a typed workflow definition or bind string IDs with `createWorkflowHooks(...)` for inferred input and output types. Callable workflows declare input/output schemas; calling parents need no extra graph declarations.

The child uses ordinary nodes and ends at `__end__`. Its human interrupts pause the parent; resume and snapshot-backed forks preserve the nested child state. Calls are sequential and require stable IDs. See [Call Child Workflows](../03-guides/06-child-workflows.md) for the complete implementation and replay contract.

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
result.interruptHistory;
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
result.interruptHistory;
```

What each field means:

- `text`: final assistant text
- `output`: parsed and validated object when `outputSchema` succeeds
- `raw`: provider-native payload for debugging
- `usage`: normalized token usage when the provider exposes it
- `finishReason`: normalized stop reason
- `providerMetadata`: provider-specific metadata that does not fit the shared top-level contract
- `warnings`: compatibility or unsupported-feature warnings surfaced by the provider
- `interruptHistory`: validated requests and responses from named interrupt contracts

> **Deprecated:** `interruptResponse` is retained for the singular
> `useReason({ interrupt })` compatibility API only. Both are removed in the
> next major release.

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
  toolExecution: {
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
  toolExecution: {
    maxSteps: 5,
    approval: false,
    emit: true,
  },
});
```

What happens:

- Kortyx sends MCP tool schemas to the provider.
- If the model requests a tool, Kortyx calls the MCP server and feeds the result back to the next model step.
- `toolExecution.maxSteps` limits the number of model passes inside the tool loop.
- `toolExecution.approval: true` uses Kortyx interrupts before executing a tool call.
- `toolExecution.emit: true` emits tool lifecycle chunks in the stream.

`include` is optional. Without it, `mcpClient.tools()` returns every tool advertised by the MCP server. Use `include` to expose only the tools this node should be allowed to call, which keeps the model prompt smaller and avoids accidentally giving a node access to unrelated server capabilities.

Model-decided interrupts can run inside the same durable tool loop. Define one
or more contracts; the model chooses the appropriate contract tool after
inspecting ordinary tool results, and can continue calling tools after resume.

```ts tabs="mcp-tools-then-interrupt" tab="TypeScript"
import { defineInterruptContract, useReason } from "kortyx";
import { z } from "zod";

const accountPicker = defineInterruptContract({
  description: "Ask the user to choose between matching accounts.",
  schemaId: "acme.account-picker",
  schemaVersion: "1",
  requestSchema: z.object({
    question: z.string(),
    candidates: z.array(z.object({ id: z.string(), label: z.string() })),
  }),
  responseSchema: z.union([
    z.object({ type: z.literal("select"), id: z.string() }),
    z.object({ type: z.literal("cancel") }),
  ]),
});

const result = await useReason({
  model,
  input: "Find this account, clarify if ambiguous, then summarize it.",
  tools,
  interrupts: {
    mode: "optional",
    maxRequests: 2,
    contracts: { accountPicker },
  },
  toolExecution: { maxSteps: 6 },
});
```
```js tabs="mcp-tools-then-interrupt" tab="JavaScript"
// The JavaScript API is identical; omit TypeScript type annotations.
```

Each contract becomes a reserved model control tool. It does not execute an
application callback or count as an application tool call. `maxSteps` remains
cumulative across resume, while `maxRequests` independently limits human turns.
The request and response are validated and recorded in
`result.interruptHistory`.

With Studio telemetry enabled, the run trace labels the human-input pause with
the selected contract name. The interrupt inspector shows its schema and, when
allowed by `captureContent`, the structured request and response. The reserved
contract control tool is not counted or displayed as an executed application
tool.

> **Deprecated:** The singular `useReason({ interrupt })` option is supported
> for the current major and emits a deprecation warning. It cannot express
> multiple named contracts and will be removed in the next major release.

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
- is isolated from state inside child workflows called with `useWorkflow`

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


## useAbortSignal

`useAbortSignal()` returns the live execution signal inside a workflow node or
custom hook. Forward it to cooperative I/O such as `fetch(url, { signal })`.
Children, `useReason`, and tools already inherit cancellation automatically.
Do not persist signals in runtime context or workflow state. See
[Execute and resume workflows](../03-guides/07-workflow-execution.md#cancel-active-work)
for HTTP wiring, cancellation outcomes, and resume behavior.


Tool faults automatically capture error type and message in Studio and OpenTelemetry, for both direct and model-selected execution. No extra wiring is required. Exceptions are not serialized: inputs, results, stack traces, causes and custom fields remain excluded. Explicit `isError: true` tool result content is captured as the error message. Messages are bounded to 8192 characters and are exported verbatim; if needed, a tool may override `telemetry.error(error)` to return `{type, message}` or `null` to suppress diagnostics. An override failure never changes tool execution.


### Automatic model error diagnostics

With tracing configured, provider/model-call failures and `useReason` decision/output-parsing failures automatically export bounded error type/message, without additional call-site wiring. Studio's failed model request inspector shows provider diagnostics; a separate **Model reasoning** row shows JSON/schema processing failures after an otherwise normally completed model response. Failed provider requests do not add a duplicate reasoning-failure row. Interrupts and cancellation retain their control-flow treatment.

Unhandled workflow and model errors automatically include bounded exception type, message, stack and cause diagnostics in trusted Studio/OpenTelemetry observations. Failed-generation events retain normalized usage counts and omit arbitrary provider metadata/raw usage. Prompts, outputs and raw provider responses remain controlled by explicit content capture. Both `createKortyxTelemetryAdapter` and `createOpenTelemetryTraceAdapter` optionally accept `error(error)` returning `{type, message, stack?, cause?}` or `null` to replace or suppress diagnostics before export; a throwing override suppresses them without changing execution. Tool diagnostics retain their narrower optional `tool.telemetry.error` projection. Client-facing `serializeFailure` and execution failure contracts remain sanitized and unchanged.
