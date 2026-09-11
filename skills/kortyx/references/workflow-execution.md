# Execute and Resume from Server Code

Use `agent.execute` for typed workflow input and one execution outcome; `agent.resume` for a structured human response. Confirm the installed version has these methods. Keep `agent.streamChat` for chat transports and `useWorkflow` for child calls inside nodes. Do not create another agent/executor configuration or add transport flags to definitions.

A callable root defines both `inputSchema` and object `outputSchema`. Register the same inferred `defineWorkflow(...)` reference on the agent. Input inference uses `z.input`, returned data uses `z.output`. Direct dynamic string IDs have runtime validation but broad output typing. Do not add caller-supplied result casts.

```ts
const result = await agent.execute({
  workflow: researchWorkflow,
  input: { topic },
  context: { tenantId },
});
if (result.status === "completed") {
  return result.data;
}
if (result.status === "suspended") {
  // Persist the private handle and display result.interrupt.
  const next = await agent.resume({
    workflow: researchWorkflow,
    resume: result.resume,
    response: { type: "select", ids: ["approve"] },
  });
}
```

`researchWorkflow` must be a registered schema-bearing definition whose input accepts `{ topic }`; its final node returns the fields required by its output schema. No special terminal-node API is needed.

- Results discriminate `completed`, `suspended`, `cancelled`, and `failed`. Only `completed` exposes validated `data`.
- Invalid commands throw `ExecutionRequestError` before starting nodes or consuming a valid interrupt; accepted execution errors return `failed`.
- Resume responses are `{ type: "text", text }`, `{ type: "select", ids }`, or `{ type: "cancel" }`. A business option named `cancel` remains an ordinary selection.
- Use the root handle for nested child interrupts. Do not construct chat messages or dispatch directly to a child run.
- A separate resume endpoint/UI uses the same registry and durable persistence. Authorize access at the application boundary; never log or publish the handle's token. Runtime context is restored from the checkpoint.
- Every execute starts a fresh run, even with an existing sessionId. Resume restores the exact waiting branch. Repeated execute is not implicit business idempotency.
- A resume returns to its caller; it does not reconnect the original SSE client.
- Follow `hooks-child-workflows.md` for replay-safe node code and forks. Completed nodes/calls are restored; surrounding interrupted node code may rerun. Count actual replayed model work, not merely hook invocation or cached reuse.

Prefer the simple Next.js API-route example when explaining entry points: `/api/chat`, `/api/execute`, `/api/resume`. Preserve the existing chat route's `stream: false` buffered response shape. Checkpoint HTTP helpers serve list/get/rollback/fork, not human responses. Canvas is an integration regression example, not a required public API pattern.

Verify the same workflow through chat and execute, both directions of chat/direct resume, nested child + later parent pauses, rejected/duplicate/stale responses, independent forks, context preservation, schema transforms, and usage with no output reader. For multi-process guarantees, reconstruct the agent with Redis and verify the tests actually use it.


## Cancellation implementation guide

- Pass `abortSignal: request.signal` at custom chat, execute, and resume HTTP boundaries. `createChatRouteHandler` does this automatically. Wire browser Stop to the same fetch's AbortController. Verify actual disconnect behavior in the deployment adapter; do not assume a closed browser always aborts a framework request.
- Child workflows, reasoning models and tools inherit the live execution signal. Local model/reason signals are combined with it. Never override the root signal or catch AbortError as ordinary tool feedback.
- Use `useAbortSignal()` inside a custom node/hook and pass it to fetch or other cooperative I/O. Tools receive `abortSignal` in their execution context. Never write signals/controllers into context, node state, workflow state or checkpoints.
- Handle `status: "cancelled"` separately from failure/suspension. Connected streams emit `cancelled` then one root `done`; disconnected clients cannot receive an outcome. Cancellation does not undo side effects or forcibly stop arbitrary JavaScript.
- Every resume supplies a fresh signal. Pre-aborted resume leaves the handle usable; abort after claiming terminates that attempt and does not restore the consumed handle. Test old-signal abort after suspension and independent forks. Human `response: { type: "cancel" }` is a distinct waiting-interrupt operation.
- Verify nested invoked/streaming model cancellation, in-flight tool cancellation with cleanup and no extra model passes, between-child cancellation, retry boundaries, concurrent root isolation, SSE disconnects, and checkpoint serialization with memory plus real Redis.
- Do not invent `agent.abort({runId})`: cross-process cancellation requires routing to the live worker and remains a separate feature.


## Execution limits implementation guide

- Configure `limits` on `createAgent` or server calls to `agent.execute` / `agent.streamChat`. Supported positive integer caps: `maxNodeExecutions`, `maxModelPasses`, `maxToolCalls`, `maxChildInvocations`. Partial overrides inherit defaults. Never accept browser-selected ceilings without application authorization.
- Nodes (including retries), dispatched model passes, executed tools and newly started child calls consume the shared root allowance. Children and `transitionTo` handoffs share it. Cached results consume no new model/tool work; actual replay does. SDK-internal retries are not separate model passes. Keep reported token usage separate from these counters; do not advertise a monetary cap.
- On exhaustion, handle `status: "suspended", reason: "limit_reached"` and the usual interrupt/handle. Streams emit `limit-reached` with runId/limit/maximum/consumed, then the normal interrupt/checkpoint flow and one done. The existing choice UI displays “Limit reached — Continue?”. Studio receives `run.limit_reached` and shows paused control flow.
- Continue uses `agent.resume({workflow, resume, response: {type: "select", ids: ["continue"]}})`. It restores the saved graph checkpoint with a fresh allowance at the saved server ceilings. Optional server `resume.limits` changes that next allowance; there is no automatic ceiling increase. Ordinary human resumes retain spent allowance and ignore limit overrides. Chat options select new-run policy; limit continuations restore the saved policy.
- Use existing checkpoint/replay semantics. Do not add tool/model micro-checkpoints or claim exactly-once execution. Completed nodes and saved child results are reused, while the active node/tool loop can repeat side effects and consume the fresh allowance. If that node exceeds a whole allowance it can pause again; choose appropriate server caps. Retain existing token usage across continuation.
- Forks copy checkpoint state and spend independently; rollback restores its checkpoint's accounting state. No cross-run budget ledger is required. Signals remain transient; counters are serializable.
- Verify all four limits, model/tool failures, retries and handoff loops, nested human answers before and after a limit, duplicate Continue, independent forks with memory and real Redis, persistence failure and cancellation while saving a pause. Test `/limits` in the API-route example and inspect a real paused/resumed run in Studio.

For early chat completion and human requests after its connection closes, see [response completion](response-completion.md). Discovery through agent.listInterrupts/getInterrupt does not require Studio or changes to useInterrupt.
