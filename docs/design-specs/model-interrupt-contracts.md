# Model-driven interrupt contracts

## Decision

`useReason` supports model-selected, schema-validated human input as part of its
durable tool loop. Applications define one or more named contracts. Kortyx
exposes each contract to the model as a reserved control tool, pauses when the
model calls it, then returns the validated human response as that call's tool
result. Ordinary tools can run before and after the pause.

```ts
const jobPicker = defineInterruptContract({
  description: "Ask the user to choose between matching jobs.",
  schemaId: "example.job-picker",
  schemaVersion: "1",
  requestSchema: JobClarificationRequest,
  responseSchema: JobClarificationResponse,
});

const result = await useReason({
  id: "brief",
  model,
  input: userRequest,
  tools: jobTools,
  toolExecution: { maxSteps: 8 },
  interrupts: {
    mode: "optional",
    maxRequests: 3,
    contracts: { jobPicker },
  },
  outputSchema: BriefAnswer,
});
```

The contract name forms the discriminant in `result.interruptHistory`; its
request and response types are inferred from the two schemas. Multiple
contracts are intentional: the model chooses the control tool whose description
and request schema fit the clarification it needs.

The same contract can be used deterministically when application code already
knows that a pause is required:

```ts
const response = await useInterrupt({
  contract: jobPicker,
  request: {
    kind: "choice",
    question: "Which engineering job?",
    candidates,
    allowRefinement: true,
  },
});
```

## Runtime semantics

- Contract tools use the reserved `kortyx_request_input__<contract>` namespace.
  Application tools may not collide with it.
- A contract call must be the only tool call in its model pass. It does not run
  an application callback, does not count as an application tool result, and is
  excluded from `result.toolCalls` / `result.toolResults`.
- The request is validated before suspension. The response is validated after
  resume and appended to model history as the control tool result.
- Messages, ordinary calls/results, interrupt history, approval decisions,
  finalization state, and the operation ID share one checkpoint. `maxSteps` is
  cumulative across resume; `maxRequests` independently bounds human turns.
- `mode: "required"` rejects a final answer until at least one contract has
  been used. `mode: "optional"` lets the model finish without interruption.
- The logical tool set remains available for the whole reasoning operation.
  Durable suspension unwinds request-scoped handles; node replay recreates them,
  while the checkpoint prevents already-completed tool calls from running again.
  Handles close on every unwind so a paused request cannot leak connections.
- Child workflow interrupts use the existing parent bridge. Custom request
  payload, contract name, schema ID/version, and structured response travel
  through the same resume handle.
- Interrupt lifecycle telemetry remains `interrupt.created`,
  `interrupt.resolved` (including a failed resume outcome),
  `interrupt.cancelled`, and API-derived `interrupt.expired`. Reason traces
  additionally record the contract and interrupt index. Contract calls are not
  reported as executed application tools.

Studio projects `kind: "custom"` as a structured contract interrupt. Its list,
detail, filters, and run trace preserve the contract name and schema identity.
The model-authored request is exported only under output-content capture; the
human response is exported only under input-content capture. Studio redacts
sensitive object keys, renders captured values structurally, and remains
read-only. Persisted projections from older releases normalize missing contract
fields to `null`/`false` instead of requiring a blocking database backfill.

The transport carries a `custom` interrupt with opaque `request`. Clients route
by `schemaId` / `schemaVersion` and respond with a structured `value` (or
`respondToInterrupt(piece, { value })` in `@kortyx/react`). Cancellation stays a
protocol action rather than a fake contract response.

## Safety and replay

The checkpoint is saved before suspension and after each validated response.
On replay, completed tool results and interrupt responses are reused; the model
is not allowed to batch an interrupt with side-effecting calls. Rollback and
fork copy the same durable state, while regenerate starts from the selected
checkpoint. Invalid requests/responses fail with schema diagnostics, and a
second concurrent resume still loses the pending-request claim as before.

## Migration

Old (deprecated; removed next major):

```ts
const result = await useReason({
  model,
  input,
  interrupt: {
    mode: "optional",
    requestSchema: JobClarificationRequest,
    responseSchema: JobClarificationResponse,
    schemaId: "example.job-picker",
    schemaVersion: "1",
  },
});

result.interruptResponse;
```

New:

```ts
const jobPicker = defineInterruptContract({
  description: "Ask the user to choose between matching jobs.",
  requestSchema: JobClarificationRequest,
  responseSchema: JobClarificationResponse,
  schemaId: "example.job-picker",
  schemaVersion: "1",
});

const result = await useReason({
  model,
  input,
  tools: jobTools,
  interrupts: {
    mode: "optional",
    maxRequests: 3,
    contracts: { jobPicker },
  },
});

result.interruptHistory;
```

The singular option still works in the current major. It is marked
`@deprecated`, emits `KORTYX_USE_REASON_INTERRUPT_DEPRECATED` once per process,
and is normalized to a single contract when combined with tools. The old
no-tools checkpoint reader is retained only so already-paused operations can
resume. Passing both `interrupt` and `interrupts` is an error.
