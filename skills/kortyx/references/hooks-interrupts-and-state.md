# Interrupts And State

Use `useInterrupt(...)` when a workflow must pause for human input.

## Basic Interrupt

```ts
import { useInterrupt } from "kortyx";

export const approvalNode = async () => {
  const selected = await useInterrupt({
    id: "approval",
    request: {
      kind: "choice",
      question: "Approve this draft?",
      options: [
        { id: "approve", label: "Approve" },
        { id: "revise", label: "Revise" },
      ],
    },
  });

  return {
    data: {
      approval: selected,
    },
    condition: selected === "approve" ? "approved" : "revise",
  };
};
```

Use stable `id` values for interrupts in nodes that can replay or contain multiple interrupt calls.

## Text And Multi-Choice

```ts
const label = await useInterrupt({
  id: "label",
  request: {
    kind: "text",
    question: "What label should we use?",
  },
});

const selected = await useInterrupt({
  id: "next-actions",
  request: {
    kind: "multi-choice",
    question: "Choose next actions:",
    multiple: true,
    options: [
      { id: "email", label: "Send email" },
      { id: "ticket", label: "Create ticket" },
    ],
  },
});
```

## `useInterrupt(...)` vs `useReason({ interrupt })`

Both pause a node for human input. They differ in who writes the request payload:

| | `useInterrupt(...)` | `useReason({ interrupt })` |
|---|---|---|
| Request payload | Authored by node code (static or computed) | Authored by the model output |
| Question and options | Deterministic app logic | Model output validated by `requestSchema` |
| Public client metadata | Pass `schemaId`, `schemaVersion`, and `meta` directly | Pass `schemaId` and `schemaVersion` in the interrupt config |
| Cost to produce request | No LLM call | One LLM call |

Choose `useInterrupt(...)` when:

- App code already knows what input to request.
- You want to ship a custom payload to the client through `meta`.
- You want to skip the extra LLM round-trip.

Choose `useReason({ interrupt })` when:

- The model should decide what to ask based on its reasoning.
- The model should produce request fields validated by `requestSchema`.
- The model may continue without interrupting when `interrupt.mode` is `"optional"`.

### Shipping Custom Payloads To The Client

Pass `meta?: Record<string, unknown>` at the top level of `useInterrupt(...)`. It appears on the client as `HumanInputPiece.meta`. The shape is opaque to Kortyx; validate it on the client.

```ts
const selected = await useInterrupt({
  id: "pick-account",
  schemaId: "account-picker",
  schemaVersion: "1",
  meta: {
    prefillQuery: "north",
    variant: "search",
  },
  request: {
    kind: "choice",
    question: "Choose an account:",
    options: [
      { id: "account-1", label: "Northwind" },
      { id: "account-2", label: "Contoso" },
    ],
  },
});
```

`schemaId` / `schemaVersion` are first-class fields used by the client to switch picker components; `meta` is the bag for the rest of the props.

## Resume Model

Kortyx resumes by replaying node logic from a checkpoint. Code before an interrupt or resumable reasoning call can run again. Make side effects replay-safe.

Replay-safe patterns:

- Put external writes after the interrupt when possible.
- Store "already did this" flags with `useNodeState(...)` or `useWorkflowState(...)`.
- Use idempotency keys when calling app services.
- Keep random ids and timestamps stable if they affect external writes.

## State Choices

- Use `useNodeState(...)` for state local to one node execution flow.
- Use `useWorkflowState(...)` for short-lived state shared across nodes in the same run.
- Use the app database for product records, users, tickets, documents, conversation history, and any data that must outlive runtime execution state.

```ts
import { useNodeState, useWorkflowState } from "kortyx";

const [notified, setNotified] = useNodeState(false);
const [approvalCount, setApprovalCount] = useWorkflowState("approvalCount", 0);

if (!notified) {
  await sendNotification();
  setNotified(true);
}

setApprovalCount((count) => count + 1);
```

`useNodeState(...)` is best for replay guards inside one node. `useWorkflowState(...)` is best for short-lived counters, flags, or accumulated values used by multiple nodes in one run.

### State Scope Across Runs

`useWorkflowState(...)` is runtime execution state. It flows through nodes and same-run `transitionTo` handoffs. Do not use it as durable application state or assume it will be restored for a later independent `agent.streamChat(...)` request.

When a later request needs a value:

- Pass server-approved request data through `useRuntimeContext(...)`.
- Persist durable values in the application database.

## Persistence

Default local behavior can be in-memory. Production interrupt/resume should use Redis through Kortyx runtime persistence when paused runs must survive restarts, deploys, or multiple instances.

When persistence details matter, verify the installed Kortyx version's available runtime persistence APIs from local package docs, TypeScript exports, existing app code, or the official docs:

- `https://kortyx.io/docs/production/persistence`
- `https://kortyx.io/docs/production/framework-adapters`

The conceptual boundary stays the same even when docs are unavailable: Kortyx runtime persistence stores paused execution state; the application database stores product/business data.

## Avoid

- Writing non-idempotent side effects before an interrupt without a guard.
- Using Kortyx runtime persistence as the app database.
- Assuming in-memory persistence is restart-safe.
- Generating new interrupt ids dynamically on every replay.
- Storing durable product records only in node/workflow state.
