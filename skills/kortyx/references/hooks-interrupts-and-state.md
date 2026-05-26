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
| Question phrasing | Whatever string you pass | Whatever the model writes (good for locale-aware, "natural" phrasing) |
| Attaching deterministic `meta` (candidates, prefill, anchors) | Pass `request.meta` directly | Hard: the model would have to echo `meta` back in its JSON output — fragile, do not rely on it |
| Cost | No LLM call | One LLM call to write the request |
| Replay caching | Cached per stable `id` | Cached per stable `id` |

Choose `useInterrupt(...)` when:

- You already know what to ask and the answer set is finite (choice/multi-choice).
- You want to ship a custom payload to the client picker via `request.meta` (e.g. candidate shortlist, prefilled search query, picker variant).
- You want to skip the extra LLM round-trip.

Choose `useReason({ interrupt })` when:

- The phrasing of the question depends on the model's reasoning (context-aware, locale-aware).
- You also want a typed parse of the question itself via `requestSchema`.

Hybrid pattern: branch in the node — call `useReason({ interrupt })` for the "open" picker case, and `useInterrupt(...)` for cases where you have deterministic candidates plus a custom client UI to render them.

### Shipping Custom Payloads To The Client

`InterruptTextInput` and `InterruptChoiceInput` accept `meta?: Record<string, unknown>`. Anything you put there appears on the client `HumanInputPiece.meta`. The shape is opaque to Kortyx; validate it on the client.

```ts
const selected = await useInterrupt({
  id: "pick-job",
  request: {
    kind: "text",
    question: "Multiple matches — pick one or search:",
    schemaId: "pick-job",
    schemaVersion: "1",
    meta: {
      prefillQuery: "marketing",
      candidates: [
        { id: "job-1", label: "Marketing Manager" },
        { id: "job-2", label: "Marketing Director" },
      ],
    },
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

### State Scope Across Workflow Transitions

`useWorkflowState(...)` is keyed by `(sessionId, workflowId)` — values set in workflow A are **not** visible when the session transitions to workflow B via `transitionTo`. If two workflows in the same session need to share a value (e.g. a "resolved jobId" that survives across `general-chat → guide-creation` handoffs):

- Pass it through `useRuntimeContext` (set by the route from server-derived or client-sent state).
- Persist it in the application database keyed by `sessionId` / `userId`.

Do not rely on Kortyx workflow state for cross-workflow continuity.

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
