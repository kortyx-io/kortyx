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
- A resume returns to its caller; it does not reconnect the original SSE client. Cancellation signals and shared execution budgets are not implemented by these two methods.
- Follow `hooks-child-workflows.md` for replay-safe node code and forks. Completed nodes/calls are restored; surrounding interrupted node code may rerun. Count actual replayed model work, not merely hook invocation or cached reuse.

Prefer the simple Next.js API-route example when explaining entry points: `/api/chat`, `/api/execute`, `/api/resume`. Preserve the existing chat route's `stream: false` buffered response shape. Checkpoint HTTP helpers serve list/get/rollback/fork, not human responses. Canvas is an integration regression example, not a required public API pattern.

Verify the same workflow through chat and execute, both directions of chat/direct resume, nested child + later parent pauses, rejected/duplicate/stale responses, independent forks, context preservation, schema transforms, and usage with no output reader. For multi-process guarantees, reconstruct the agent with Redis and verify the tests actually use it.
