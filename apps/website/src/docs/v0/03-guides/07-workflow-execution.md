---
id: v0-workflow-execution
title: "Execute and Resume Workflows"
description: "Invoke registered workflows with typed input and results, then resolve human interrupts through a separate server entry point."
keywords: [kortyx, execute, resume, workflows, backend, interrupts]
sidebar_label: "Execute and Resume"
---
# Execute and Resume Workflows

Use `agent.execute` to invoke a registered workflow from an HTTP handler, Server Action, activity, or script. It returns one execution outcome. Use `agent.resume` to answer a human interrupt and continue that execution. Both use the same graph engine, registry, persistence, child calls, and telemetry as chat.

## One workflow contract

```ts
import { createAgent, defineWorkflow } from "kortyx";
import { z } from "zod";

export const summaryWorkflow = defineWorkflow({
  id: "summary",
  version: "1.0.0",
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ summary: z.string() }),
  nodes: {
    summarize: {
      run: ({ input }: { input: { text: string } }) => ({
        data: { summary: input.text.slice(0, 180) },
      }),
    },
  },
  edges: [["__start__", "summarize"], ["summarize", "__end__"]],
});

export const agent = createAgent({ workflows: [summaryWorkflow] });
```

The terminal node returns ordinary `data`. The workflow schemas describe its public input and output; no transport or execution mode belongs in its definition.

```ts
const result = await agent.execute({
  workflow: summaryWorkflow,
  input: { text: "A brief to summarize." },
  context: { tenantId: "tenant-1" },
});

if (result.status === "completed") {
  console.log(result.data.summary); // Inferred from outputSchema.
}
```

Use the same definition registered with the agent. Both schemas are required for direct execution. Input is validated before any node starts, and completed data is parsed through the output schema. Input and output must be JSON-compatible; output must be an object. Schema transforms run on initial input and final output, not on every resume. Dynamic string workflow IDs are supported but return `Record<string, unknown>` rather than an inferred result.

Each `execute` starts a fresh run. An optional `sessionId` groups runs; it does not load the previous session head or make repeated calls idempotent. Omit it to create an isolated session. Chat retains its existing conversational continuation behavior.

## Handle the outcome

Every result includes `runId` and `sessionId`, plus `checkpointId` and reported `usage` when available.

| Status | Additional fields | Meaning |
| --- | --- | --- |
| `completed` | `data` | Validated final workflow output |
| `suspended` | `interrupt`, `resume` | Waiting for a human response |
| `cancelled` | `reason` | Active execution or the waiting request was cancelled |
| `failed` | `error.code`, `error.message` | Execution or output validation failed |

Invalid commands reject with `ExecutionRequestError`: for example invalid input, a mismatched workflow reference, or an invalid/stale resume handle. They do not turn an existing waiting execution into a failed run. A business rejection, such as `{ approved: false }`, can be a successful `completed` result.

## Resume from another endpoint

A suspended result includes the interrupt question/options and a serializable `resume` handle. Keep that handle private and pass it back unchanged:

```ts
const next = await agent.resume({
  workflow: summaryWorkflow,
  resume: savedResumeHandle,
  response: { type: "select", ids: ["approve"] },
});
```

Use a workflow that actually calls `useInterrupt` or an interrupting child for this path. The example above illustrates the invocation shape; the simple summary workflow does not pause.

Supported responses are:

```ts
{ type: "text", text: "My answer" }
{ type: "select", ids: ["approve"] }
{ type: "cancel" }
```

Text responses must be nonempty. The SDK validates the response against the stored interrupt before consuming its token. Static choices must use known option IDs; a single-choice interrupt accepts one ID. Dynamic pickers with no static options retain application-owned selection validation. Built-in memory and Redis adapters claim a token atomically, so only one competing resume succeeds.

For nested children, submit the root handle. The engine restores the waiting child, returns its result to its parent, and continues. Another pause returns another suspended outcome. The workflow reference supplies result typing and must match the stored entry workflow/version.

Resume restores saved runtime context. Authorize access in the endpoint before invoking the SDK. Configure durable persistence, such as Redis, when the original caller and approval handler run in different processes or must survive a restart. The SDK does not itself schedule background work or reopen a previous HTTP/SSE connection; the next result belongs to the resume caller.

## Separate HTTP routes

The Next.js API-route example provides:

| Page | Endpoint | Purpose |
| --- | --- | --- |
| `/` | `POST /api/chat` | Existing streamed or buffered chat |
| `/execute` | `POST /api/execute` | Execute a brief workflow and inspect its outcome |
| `/resume` | `POST /api/resume` | Resolve its child approval and see the parent result |

The execute route remains small:

```ts
export async function POST(request: Request) {
  const body = await request.json();
  const result = await agent.execute({
    workflow: briefReviewWorkflow,
    input: body.input,
  });
  return Response.json(result);
}
```

The resume route uses the same server agent:

```ts
export async function POST(request: Request) {
  const body = await request.json();
  const result = await agent.resume({
    workflow: briefReviewWorkflow,
    resume: body.resume,
    response: body.response,
  });
  return Response.json(result);
}
```

These snippets omit application error handling. The runnable example includes it. Its UI keeps the pending handle in browser session storage for navigation between its two pages; a production approval inbox should store and authorize access on the server.

`stream: false` on the existing chat route still means buffered chat chunks. It does not change into this typed execution contract. `parseCheckpointRequestBody` and `handleCheckpointRequestBody` remain helpers for listing, reading, rolling back, and forking checkpoints.

## Tracing, replay, and limits

Execution continues without a UI stream reader. Model calls may still use provider streaming internally. Reported token usage is cumulative for the logical execution, including child usage available at suspension. Reusing cached work does not charge it again; replayed model calls that actually run again do count. Unknown usage stays absent. Traces remain server-side, with the same run/child identities used by Studio.

A fork inherits completed work and then accumulates its own subsequent usage. Rolling back restores the checkpoint's accounting baseline. Runtime restoration cannot undo committed business side effects; use application idempotency or transactions where needed.

This API executes in-process until completion, suspension, cancellation, or failure. Shared whole-tree execution budgets remain a separate feature.


## Cancel active work

Pass a live `AbortSignal` to `agent.execute`, `agent.resume`, or `agent.streamChat`.
In an HTTP route, forward `request.signal` so disconnecting the request cancels
its workflow tree. `createChatRouteHandler` forwards it automatically; custom
routes and `handleChatRequestBody` callers supply it explicitly.

```ts
const result = await agent.execute({
  workflow: researchWorkflow,
  input: { topic: "Workflow cancellation" },
  abortSignal: request.signal,
});
if (result.status === "cancelled") {
  // This branch is observable when the caller is still connected.
}
```

For a browser Stop button, use an `AbortController` with `fetch`, then call
`controller.abort()`. The server framework must expose client disconnects through
`request.signal`. Cancelling an SSE response body created by `toSSE` also cancels
its active Kortyx source. A disconnected browser cannot receive the final outcome.

The signal automatically reaches child workflows, model requests, and tools.
Kortyx checks it before starting subsequent nodes, retry attempts, child calls,
model passes, and tools. A local reasoning/model signal is combined with the root
signal; it cannot override root cancellation. Abort errors bypass node retries and
ordinary tool-error feedback. Direct calls return `status: "cancelled"`; connected
stream consumers receive a `cancelled` event and one root `done` event.

With Studio telemetry configured, `run.cancelled` marks the run and active child
calls as cancelled. Studio presents AbortError spans as cancelled in its trace
and event views. It records the outcome, not the live AbortSignal object.

Custom node I/O can cooperate using `useAbortSignal`:

```ts
import { useAbortSignal } from "kortyx";

async function loadDocument() {
  const response = await fetch("https://example.com/document", {
    signal: useAbortSignal(),
  });
  return { data: { text: await response.text() } };
}
```

Tools receive `abortSignal` in their execution context. Forward it to their I/O
as well. Cancellation cannot undo committed side effects or forcibly stop
arbitrary JavaScript. Work that ignores the signal can delay termination until
it returns; Kortyx then prevents subsequent work.

Signals are transient and never stored in checkpoints. Each resume receives its
own fresh signal, including resumes of nested child interrupts and forks. A
pre-aborted resume leaves the waiting handle unclaimed. Once a resume has claimed
the handle and started, cancellation ends that attempt; it does not create a new
human-input pause or make the consumed handle reusable. Earlier checkpoints remain
available for explicit replay/fork, with the usual side-effect safeguards.

`response: { type: "cancel" }` remains the separate operation for declining a
waiting human interrupt. Cancellation by run ID across processes and shared
execution budgets are not part of this API yet.

Try `/execute` in the simple Next.js example: enable the 10-second delay and press
Stop. `/api/chat`, `/api/execute`, and `/api/resume` all forward the request signal.
