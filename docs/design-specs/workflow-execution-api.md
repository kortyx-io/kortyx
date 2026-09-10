# Workflow execution without chat

Status: implemented for local review in story 1. Builds on merged PR #157.

## Decision

Keep workflows independent of their transport. A workflow declares its data contract and graph. The caller chooses `agent.execute(...)`, `agent.resume(...)`, `agent.streamChat(...)`, or `useWorkflow(...)` inside a node. Do not add `mode: "backend"`, `transport`, `callable`, or another `useReason` mode to workflow definitions.

Keep `createAgent` as the owner of the registry, providers, telemetry, and framework adapter. Adding another public executor would duplicate configuration and make parent/child execution harder to reason about.

## Canonical example and scope

Use `examples/kortyx-nextjs-chat-api-route` as the primary developer example. Its existing route parses chat input, calls `agent.streamChat`, and returns either `toSSE(stream)` or `collectBufferedStream(stream)`. Keep that route and its response contract intact.

Add result-only execute and resume callers beside it. `execute` returns one outcome object rather than chunks; `resume` accepts a stored suspension handle and a response, continues the same execution, and returns its next outcome. Resume can be invoked by another HTTP endpoint, an approval interface, a Server Action, or a script using the same configured registry and persistence.

Resumed results go to the resume caller. This does not reopen the original SSE connection or automatically push a response into another UI. Existing chat resume remains supported by the chat adapter over the same resume engine.

Canvas is a larger integration example combining editing, business persistence, confirmation, history, and child calls. Keep it for regression verification; do not use its application complexity to dictate the public API, and do not include a Canvas cleanup in story 1.

## Evidence from the current examples

- Canvas's `canvas-creation-workflow.ts` already declares `inputSchema: z.string()` and an output schema with `summary` and `canvas`. Its terminal node returns ordinary `data`; the same contract can serve a root invocation.
- Canvas's `canvas-save-workflow.ts` currently accepts a string, gets the canvas and save confirmation through runtime context, and guarantees `responseText` in its output. Additional fields are retained with `.passthrough()`, which does not give backend callers a precise business-result type.
- The API-route example currently calls `agent.streamChat(body.messages, ...)`, then selects SSE or buffered chunks at the route boundary. That is the right place to choose a transport.
- The Server Action example also calls `streamChat`, then collects `StreamChunk[]`. Buffering chat chunks is not a typed workflow execution API.
- The checkpoint-lab workflow is deterministic and has sequential interrupts, making it useful for entry-point parity tests without a model dependency.

Paths are relative to the repository root:

| Responsibility | Existing location | Proposed change |
| --- | --- | --- |
| Workflow input/output | `examples/kortyx-nextjs-chat-api-route/src/workflows/*.ts` | Add or reuse `inputSchema` / `outputSchema`; no transport declaration |
| Registry and runtime services | `examples/kortyx-nextjs-chat-api-route/src/lib/kortyx-client.ts` | Keep one `createAgent` configuration |
| HTTP/chat adaptation | `examples/kortyx-nextjs-chat-api-route/src/app/api/chat/route.ts` | Keep chat adaptation here; demonstrate `execute` in a separate backend caller |
| Buffered Server Action | `examples/kortyx-nextjs-chat-server-action/src/app/actions/chat.ts` | Keep the chat example; add a typed business-operation example |
| Public SDK entry points | `packages/agent/src/chat/create-agent.ts` | Add `execute` and `resume` to the existing agent |
| Shared root preparation | `packages/agent/src/chat/process-chat.ts` | Extract message-independent execution preparation |
| Resume preparation | `packages/agent/src/interrupt/resume-handler.ts` | Separate structured resume handling from chat metadata parsing |
| Graph and child execution | `packages/runtime/src/graph/` | Reuse graph/checkpoint/child services and contract-validation rules |

## Proposed developer API

The SDK now exposes these entry points. The runnable Next.js API-route example provides `/execute` and `/resume` review pages.

### Execute from the simple API-route example

First give the existing `generalChatWorkflow` an explicit `z.string()` input schema and `z.object({ text: z.string() })` output schema. Its chat node already returns `{ data: { text } }`; no new node behavior or workflow mode is needed.

```ts
import { agent } from "@/lib/kortyx-client";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";

const result = await agent.execute({
  workflow: generalChatWorkflow,
  input: "Explain what Kortyx does",
  context: { tenantId },
});

if (result.status === "completed") {
  result.data.text; // Inferred and validated from the workflow output schema.
}
```

An HTTP execute endpoint can return `Response.json(result)`. This is distinct from `stream: false` in the existing chat route: that route returns buffered chat output, whereas execute accepts workflow input and returns a typed execution outcome.

Use the same workflow reference registered in `createAgent({ workflows: [...] })`. Mirror `useWorkflow`'s existing contract checks: the reference must match the registered version and schemas; passing a definition does not register it or bypass the registry.

Direct references are the primary typed API for this story. Dynamic registered string IDs may use a runtime-validated overload returning `Record<string, unknown>`, with both schemas still required. Do not introduce caller-supplied output generics such as `execute<MyOutput>(...)`. Do not require another binding helper just to call a root workflow. Typed string-ID inference from agent registration can follow if it fits without expanding this story.

Input uses `z.input<typeof inputSchema>`; nodes receive parsed input. Completed data uses `z.output<typeof outputSchema>`. Retain the current JSON-compatible input/output and object-output constraints. Input transforms run once on initial admission, not again on resume. Completion validates the public output once; replay reuses already validated values.

### Resume a suspension

For a workflow that can pause (for example the existing interrupt/checkpoint demo with explicit input/output contracts), retain its registered reference as `interruptedWorkflow`. A separate resume endpoint can use:

```ts
if (result.status === "suspended") {
  // The application can persist this JSON value, display the interrupt,
  // and resume in a different process after the user responds.
  const next = await agent.resume({
    workflow: interruptedWorkflow,
    resume: result.resume,
    response: { type: "select", ids: [selectedOptionId] },
  });
}
```

The workflow reference supplies output inference even after JSON serialization. The server verifies it against the stored root execution; the caller cannot use a different reference to relabel the output type.

`resume` is a serializable, SDK-owned handle containing the existing request/token and execution identity. Its contents are opaque to application routing. The store remains authoritative: check session, request, branch, workflow/version, expiry, and atomic token consumption. The application authorizes access to the execution before calling the SDK; a handle is not an authorization policy and must not enter public telemetry.

Response forms:

```ts
type ResumeResponse =
  | { type: "text"; text: string }
  | { type: "select"; ids: string[] }
  | { type: "cancel" };
```

Validate against the stored interrupt's kind, choices, and selection constraints before consumption. Do not invent generic typed JSON interrupt responses in this PR: current interrupt primitives support text and selections. An ordinary option whose ID is `cancel` remains a business choice; `type: "cancel"` invokes protocol cancellation and produces a cancelled execution outcome.

Nested child interruptions return through the root result. Applications resume the root handle; the engine locates the waiting leaf, resumes it, and continues the parent. A later interrupt returns another suspended result and fresh handle. No child endpoint, child run selection, chat message, or child-path dispatch is required.

### Outcomes

```ts
type ExecutionResult<T> = ExecutionInfo & (
  | { status: "completed"; data: T }
  | { status: "suspended"; interrupt: ExecutionInterrupt; resume: ResumeHandle }
  | { status: "cancelled"; reason?: string }
  | { status: "failed"; error: ExecutionFailure }
);

type ExecutionInfo = {
  runId: string;
  sessionId: string;
  checkpointId?: string;
  usage?: TokenUsage;
};
```

Reuse existing run, session, checkpoint, interrupt, and token-usage identities/types where possible. Do not create a second `executionId` namespace. Only completed results expose typed `data`; raw `GraphState`, partially validated data, and accumulated UI chunks are not the result contract.

Failures during accepted execution, including output-contract failures and node `emit-and-stop` errors, return `failed` with a stable code and serializable message. Application business rejection can be a completed workflow result, for example `{ saved: false, reason: "policy" }`; the engine must not reinterpret domain data as an execution failure.

Invalid invocation commands (unknown workflow, missing contracts, invalid initial input, invalid/stale resume handle or response) reject with a documented SDK request error before executing nodes or consuming a valid waiting request. Distinguish command rejection from a running workflow failing; an invalid resume attempt must not mark the original run failed. Validate resume responses before the atomic claim, and cover claim/persistence failure recovery with the existing store semantics.

Story 1 only exposes cancellation already supported by suspended-request cancellation. Root `AbortSignal` propagation belongs to story 2. Do not imply that a timed-out HTTP request or a dropped event reader cancels an execution.

## What belongs in a workflow definition?

Only its reusable business contract and graph:

```ts
const summarizeBriefWorkflow = defineWorkflow({
  id: "summarize-brief",
  version: "1.0.0",
  inputSchema: z.object({ briefId: z.string() }),
  outputSchema: z.object({ summary: z.string() }),
  nodes: { summarize: { run: summarizeBriefNode } },
  edges: [["__start__", "summarize"], ["summarize", "__end__"]],
});
```

Outside a node: `agent.execute({ workflow: summarizeBriefWorkflow, input: { briefId }, context })`.

Inside a node: `await useWorkflow({ id: "summary", workflow: summarizeBriefWorkflow, input: { briefId } })`.

The last node still returns `{ data: { summary } }`. Neither the workflow nor the node needs to know whether a human chat, an HTTP handler, or a script initiated the work.

Business arguments such as brief ID, canvas content, and requested operation belong in `input` for a reusable backend example. Tenant/user identity and server-supplied execution context belong in `context`. Providers and persistence stay on the agent. Do not introduce a context-schema framework or dependency injection container in this story. Preserve the existing runtime-context hook and its checkpoint behavior; documentation must not imply that an arbitrary context cast is schema validation.

On resume, restore checkpointed business context; do not replace it with a new HTTP body. Applications reauthorize the request at their boundary. Fresh transient resources and cancellation signals are a separate execution-context concern for subsequent stories.

## Sessions and handoffs

`execute` always starts a new root invocation of the explicitly requested workflow. Omitted `sessionId` generates an isolated session. An explicit session groups checkpoints/runs; it must not silently feed the previous session head's data into a new backend operation. Repeated execute calls are new work, not implicit idempotent retries. Existing chat continuation behavior remains an explicit adapter policy. `resume` restores the exact suspended checkpoint and branch instead of starting another operation.

Use the same session checkpoint store, fork/rollback APIs, and nested snapshots. A forked suspension needs a resume handle for that branch; the original handle must not resume the fork. Reconstructed agents resolve registered code and reject incompatible versions rather than pretending to execute historical code. Runtime state restoration does not undo external writes.

Preserve `transitionTo` for root handoffs. A typed root invocation promises its entry workflow's public output contract across the complete handoff chain. Intermediate workflow boundaries use their registered contracts; final data must satisfy the entry contract before returning `completed`. Apply any particular boundary's transform only once. An incompatible terminal output produces `failed`, not a falsely typed result. Children retain their current call/return semantics and current restriction on child handoffs.

## One engine, independent output delivery

```text
agent.execute / agent.resume ──────────────┐
                                          ├─ shared execution orchestration
agent.streamChat ─ chat request adapter ───┘     ├─ registry + providers
                                               ├─ graph + child calls
                                               ├─ checkpoints + resume claims
                                               ├─ authoritative outcome
                                               └─ trace / usage / UI events
```

Refactor the engine to produce an authoritative typed outcome separately from its UI event stream. `execute` awaits that outcome and does not buffer every chunk. Chat reads the same execution's UI events and preserves its existing transport contract. A legacy `done` chunk means the transport finished; it is not sufficient evidence of successful workflow completion.

Do not implement `execute` by constructing a user message or scraping a chat `done` chunk. Conversely, do not implement chat by awaiting a fully buffered result: that would lose live streaming. Both entry points must run the same graph runner and child-call service.

Provider streaming and delivery to a client are separate choices. A node's existing streaming model call can run during `execute`; its UI output may be unobserved. Trace spans, provider-reported usage, and lifecycle telemetry still record. Completion must not depend on an event consumer draining UI output, and unused output must not grow an unbounded buffer.

Reuse existing usage accumulation across children and resumes. Report cumulative known usage for the logical run without adding cached child work again. Missing provider usage is unavailable, not a claim of zero cost. Full shared-budget accounting and estimates are story 3.

Start and resume execute in the calling process until completion, suspension, cancellation, or failure. This API does not schedule background workers or make a Temporal activity durable automatically. An activity can return/persist a suspension; its application decides when to invoke resume.

## Examples and documentation to deliver

1. Extend the simple API-route example with result-only execute and resume endpoints. Keep its current chat route unchanged. Add a small framework-free execution example with typed object input, a deterministic child, and a nested interrupt. Demonstrate start, serialize, reconstruct the agent, resume, and inspect typed output. It should run without a model key or Next.js `server-only` imports.
2. Use the same workflow definitions through an example chat entry point. Adapt chat input in a thin parent node with `useWorkflow`, or directly use a string-input workflow to prove root parity. Do not JSON-stringify object input into a chat message and claim typed execution.
3. Keep Canvas as the realistic compatibility check: execute its creation workflow with its current string contract and context, including its two pickers and child return. Separately tighten business input/output contracts for any Canvas operation presented as a reusable backend operation. Do not bundle a full Canvas redesign into the execution API.
4. Show a Server Action/HTTP handler returning a completed domain result or suspension descriptor instead of `StreamChunk[]`. HTTP status codes, authentication, human UI, scheduling, and business idempotency remain application choices.
5. Add an “Execute and resume workflows” guide beside child-workflow guidance; explain the workflow/agent/caller boundaries in the overview. Link the standalone example from `examples/README.md` and add an execution topic to the Kortyx skill router/reference set when implemented.
6. Studio uses the same root runs, child tree, and interrupted states. No new backend-only workflow catalog or duplicate execution rows. Entry-point metadata may identify a chat or direct invocation; it must not drive execution semantics.

## Required validation

- Type inference for input transforms and completed output; rejected wrong input and unchecked result access; honest dynamic-ID output types; mismatched references rejected.
- Root input and output schema failures; no partially valid completion; transforms run once through resume and cached children.
- Deterministic chat/direct parity for returned data, side effects, child invocation identity, and usage; object input delivered without string conversion.
- Nested and sequential interruptions, invalid response without token consumption, cancellation distinct from an ordinary decline choice, subsequent parent work after child completion.
- Memory and Redis reconstruction, duplicate/concurrent token claims, independent forks, rollback, expired handles, and incompatible versions.
- Runtime exceptions and `emit-and-stop` nodes produce failed outcomes; a transport `done` after an interrupt/error never becomes completed.
- Known token usage and tracing survive unobserved UI output; cached results are not charged twice; large event streams do not accumulate unbounded memory.
- Direct execute never silently resumes prior session state. Root handoffs preserve the entry contract and report incompatible terminal output.
- Existing chat API route, Server Action, Canvas streaming, and Studio inspection remain functional.

## Deferred

Root signal propagation, deadlines/shared limits, child visibility policies, parallel children, cross-process cancellation, background scheduling, arbitrary JSON interrupt schemas, typed intermediate-node graph inference, and a full business-contract migration of Canvas.
