# Direct and model-driven tools

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
  title: "Read job knowledge",
  description: "Read permitted job information",
  inputSchema: {
    type: "object",
    properties: { jobId: { type: "string" } },
    required: ["jobId"],
  },
  outputSchema: {
    type: "object",
    properties: {
      status: { type: "string" },
      text: { type: "string" },
    },
    required: ["status"],
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

## Choose The Execution Path

- Use `useTool({ tool, input })` when node code deterministically chooses the tool
  and already has its arguments. No model pass is added.
- Use `useReason({ tools: [tool] })` when the model should choose whether to call
  the tool, select among tools, or construct arguments.
- Import local tools directly or build them from request-scoped factories. Tools
  returned by `createMCPClient(...).tools()` implement the same executable
  contract and can be mixed with local tools in one `useReason` call.

Do not wrap a deterministic service call in `useReason` merely to get Studio
visibility. Conversely, do not use `useTool` when model judgment is required to
select a capability or arguments.

## Complete `KortyxExecutableTool` Contract

```ts
interface KortyxExecutableTool<TInput = unknown, TResult = unknown> {
  name: string;
  title?: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  annotations?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  outcomes?: {
    denialCodes?: readonly string[];
    classifyResult?(result: TResult): {
      outcome: "success" | "denied" | "fault";
      code?: string;
    };
    classifyError?(error: unknown): {
      outcome: "success" | "denied" | "fault";
      code?: string;
    };
  };
  telemetry?: {
    error?(error: unknown): { type?: string; message: string } | null;
  };
  execute(
    input: TInput,
    context: { toolCallId: string; abortSignal?: AbortSignal },
  ): TResult | Promise<TResult>;
  close?: () => void | Promise<void>;
  closeAfterUse?: boolean;
  source?: string;
}
```

- `name` is the stable provider/telemetry identifier. Keep it safe and free of
  user data.
- `title` and `description` help people and models understand the capability.
  Describe when to use it and what it returns, not credentials or workflow state.
- `inputSchema` and optional `outputSchema` advertise the provider contract. A
  local direct call is not automatically validated by these schemas; validate
  untrusted input inside `execute` or before `useTool`.
- `annotations` and `metadata` are provider/tool metadata, not an authorization or
  secret-storage channel.
- `execute` receives the runtime-owned tool-call id and effective cancellation
  signal. Forward `abortSignal` to cooperative I/O and preserve cancellation.
- `outcomes` classifies observation only. It never changes the returned value,
  thrown error, permission decision, retry policy, or control flow.
- `telemetry.error` may project a fault to bounded safe diagnostic strings or
  return `null` to suppress them. It must not throw intentionally or perform the
  business operation.
- `close` releases an owned resource. `closeAfterUse` defaults to `true`; use
  `false` only for an application-owned long-lived resource that the app closes.
- `source` records tool provenance for integrations. Do not use it for access
  policy or per-request secrets.

Permission enforcement and input validation remain inside the application's tool.
`inputSchema` advertises model arguments; it is not an automatic local validator.
`outcomes` classifies observations without changing returned values, throwing a
new exception, granting permissions, or controlling retries. `classifyError` may
map an application error to a denial; the original exception still propagates
from `useTool`. Throwing classifiers cannot affect execution. Without a mapper,
returned values succeed, thrown errors and `isError: true` tool results are faults.
Cancellation is runtime-owned and cannot be reclassified.

## Results, Structured Content, And Safe Failures

Ordinary local return values are preserved by `useTool`. In a model-driven loop,
Kortyx converts strings to text and object values to JSON text plus
`structuredContent`. If a tool needs explicit control, return a
`KortyxToolResult` using the current call id:

```ts
import {
  serializeFailure,
  type KortyxExecutableTool,
  type KortyxToolResult,
} from "kortyx";

const accountTool: KortyxExecutableTool<
  { id: string },
  KortyxToolResult
> = {
  name: "read_account",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
  async execute({ id }, { toolCallId, abortSignal }) {
    try {
      const account = await accounts.read(id, { signal: abortSignal });
      return {
        toolCallId,
        name: "read_account",
        content: `Found ${account.name}`,
        structuredContent: { id: account.id, name: account.name },
      };
    } catch (error) {
      const failure = serializeFailure(error); // propagates control flow
      return {
        toolCallId,
        name: "read_account",
        content: failure.message,
        failure,
        isError: true,
      };
    }
  },
};
```

`content` is the model-readable string; `structuredContent` retains a structured
payload; `isError: true` classifies the returned result as a fault; and optional
`failure` carries a JSON-safe `FailureDescriptor`. Keep public content and
structured values free of secrets. `raw` and provider metadata are advanced
adapter fields and are not a safe place for credentials.

When a model-selected tool throws an ordinary error, Kortyx catches it, applies
`serializeFailure`, and returns a safe `isError` result to the model so the loop
may recover. Cancellation, human suspension, and execution limits are control
flow and propagate instead of becoming tool feedback. Direct `useTool` preserves
the original thrown error. Do not expose raw provider bodies, stacks, tokens, or
arbitrary exception properties as tool content.

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

Tool faults automatically capture error type and message without extra wiring. Explicit `isError: true` result content is the error message. Diagnostics are bounded to 256/8192 characters; exception objects, causes, stacks and raw inputs/results are excluded. Messages are exported verbatim, so applications may optionally use `tool.telemetry.error(error)` to return `{type, message}` or `null` to suppress diagnostics. Throwing projections suppress capture without changing execution. Denials and cancellation do not capture errors. Request context
is not copied wholesale into telemetry. Explicit app telemetry metadata is opt-in;
credential-shaped fields are filtered, but free text cannot be automatically made
safe. Telemetry delivery and observer callback failures never change execution.
