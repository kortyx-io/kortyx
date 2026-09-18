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

Tool faults automatically capture error type and message without extra wiring. Explicit `isError: true` result content is the error message. Diagnostics are bounded to 256/8192 characters; exception objects, causes, stacks and raw inputs/results are excluded. Messages are exported verbatim, so applications may optionally use `tool.telemetry.error(error)` to return `{type, message}` or `null` to suppress diagnostics. Throwing projections suppress capture without changing execution. Denials and cancellation do not capture errors. Request context
is not copied wholesale into telemetry. Explicit app telemetry metadata is opt-in;
credential-shaped fields are filtered, but free text cannot be automatically made
safe. Telemetry delivery and observer callback failures never change execution.
