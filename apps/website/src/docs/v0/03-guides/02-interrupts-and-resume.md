---
id: v0-runtime-interrupts-resume
title: "Interrupts and Resume"
description: "Pause node execution for user input and resume deterministically using tokens and request ids."
keywords: [kortyx, interrupt, resume, human-input, pending-requests, checkpoints]
sidebar_label: "Interrupts and Resume"
---
# Interrupts and Resume

Interrupts let a node pause execution and wait for user input.

## Node side

```ts
import { useInterrupt } from "kortyx";

const picked = await useInterrupt({
  id: "pick-topics",
  request: {
    kind: "multi-choice",
    question: "Pick one or more:",
    options: [
      { id: "product", label: "Product" },
      { id: "design", label: "Design" },
    ],
  },
});
```
```js
import { useInterrupt } from "kortyx";

const picked = await useInterrupt({
  id: "pick-topics",
  request: {
    kind: "multi-choice",
    question: "Pick one or more:",
    options: [
      { id: "product", label: "Product" },
      { id: "design", label: "Design" },
    ],
  },
});
```

Use stable `id` values for interrupts in nodes that can replay or contain multiple interrupt calls.

Use `defineInterruptContract(...)` with
`useReason({ interrupts: { contracts } })` when the model should decide whether
to ask. You may provide several named contracts; each becomes a model-visible
control tool with validated request and response schemas. Ordinary tools can run
before and after the pause. `mode: "required"` requires at least one human turn,
while `mode: "optional"` lets the model finish immediately when clarification is
unnecessary. `maxRequests` bounds sequential interruptions.

The singular `useReason({ interrupt })` API is deprecated and will be removed
in the next major release.

> **Good to know:** Use required interrupts for approvals and safety gates. Optional interrupts are best for flows where the model can answer immediately but may ask for user input when the request is ambiguous.

## Interrupts inside child workflows

A child called with `useWorkflow(...)` can use either interrupt hook. Its request is bridged through the parent stream and uses the existing resume token/request ID protocol. The parent continues after the child completes. Do not start the child again as a separate root request to answer its interrupt.

See [Call Child Workflows](./06-child-workflows.md) for a working typed example, replay rules, and fork behavior.

## Stream side

During interrupt, runtime/orchestrator emits:

```json
{
  "type": "interrupt",
  "requestId": "human-...",
  "resumeToken": "...",
  "workflow": "interrupt-demo",
  "node": "askMulti",
  "input": {
    "kind": "multi-choice",
    "multiple": true,
    "question": "Pick one or more:",
    "options": [
      { "id": "product", "label": "Product" },
      { "id": "design", "label": "Design" }
    ]
  }
}
```

## Resume payload

`@kortyx/agent` resume metadata shape (from `parseResumeMeta`):

```json
{
  "role": "user",
  "content": "Product",
  "metadata": {
    "resume": {
      "token": "<resumeToken>",
      "requestId": "<requestId>",
      "selected": ["product"]
    }
  }
}
```

Accepted `selected` shapes:

- string
- string[]
- `{ choice: { id } }`
- `{ choices: [{ id }, ...] }`

Contract interrupts use an opaque structured value instead of `selected`:

```json
{
  "resume": {
    "token": "<resumeToken>",
    "requestId": "<requestId>",
    "value": { "type": "select", "jobId": "job-123" }
  }
}
```

In `@kortyx/react`, custom renderers receive `piece.contract`,
`piece.request`, `piece.schemaId`, and `piece.schemaVersion`, then call
`respondToInterrupt(piece, { value })`. The server validates that value against
the selected contract's response schema before reasoning continues.

> **Good to know:** On resume, node code starts again from the top. `useReason` continues from its internal checkpoint, but code before `useReason` can run again unless you guard it. Prefer putting `useReason` first in the node and use `useNodeState` for pre-events that should emit once.

```ts
const [startEmitted, setStartEmitted] = useNodeState(false);

if (!startEmitted) {
  useStructuredData({
    streamId: "lifecycle",
    dataType: "lifecycle",
    data: { step: "start" },
  });
  setStartEmitted(true);
}

const result = await useReason({
  id: "resume-safe-step",
  model,
  input,
});
setStartEmitted(false);
```
```js
const [startEmitted, setStartEmitted] = useNodeState(false);

if (!startEmitted) {
  useStructuredData({
    streamId: "lifecycle",
    dataType: "lifecycle",
    data: { step: "start" },
  });
  setStartEmitted(true);
}

const result = await useReason({
  id: "resume-safe-step",
  model,
  input,
});
setStartEmitted(false);
```

## Replay-Safe Side Effects

Code before an interrupt or resumable reasoning call can run more than once. Make side effects safe to repeat.

Replay-safe patterns:

- Put external writes after the interrupt when possible.
- Store "already did this" flags with `useNodeState(...)` or `useWorkflowState(...)`.
- Use idempotency keys when calling app services.
- Keep random ids and timestamps stable if they affect external writes.

```ts
import { useInterrupt, useNodeState } from "kortyx";
import { sendApprovalEmail } from "@/services/email";

export async function approvalNode() {
  const [emailSent, setEmailSent] = useNodeState(false);

  if (!emailSent) {
    await sendApprovalEmail({ idempotencyKey: "approval-email" });
    setEmailSent(true);
  }

  const decision = await useInterrupt({
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
    data: { decision },
    condition: decision === "approve" ? "approved" : "revise",
  };
}
```
```js
import { useInterrupt, useNodeState } from "kortyx";
import { sendApprovalEmail } from "@/services/email";

export async function approvalNode() {
  const [emailSent, setEmailSent] = useNodeState(false);

  if (!emailSent) {
    await sendApprovalEmail({ idempotencyKey: "approval-email" });
    setEmailSent(true);
  }

  const decision = await useInterrupt({
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
    data: { decision },
    condition: decision === "approve" ? "approved" : "revise",
  };
}
```

Use the app database for product records, users, tickets, documents, conversation history, and anything that must outlive runtime execution state.

## Persistence requirements

Resume only works if the framework adapter persists pending requests + checkpoints.

- in-memory adapter: good for local dev, not restart-safe
- redis adapter: recommended for production resume
- hook state (`useNodeState` / `useWorkflowState`) follows the same checkpoint lifetime and limits

## Expiry and late responses

Pending interrupt state expires after 15 minutes by default. Configure the TTL
for the application with `KORTYX_FRAMEWORK_TTL_MS`, or pass `ttlMs` to the
framework adapter:

```ts
import { createRedisFrameworkAdapter } from "kortyx";

const frameworkAdapter = createRedisFrameworkAdapter({
  url: process.env.KORTYX_REDIS_URL!,
  ttlMs: 60 * 60 * 1000,
});
```

The runtime includes the resulting `expiresAt` timestamp in
`interrupt.created`. Clients should stop offering the original resume action
after that time.

Once the checkpoint expires, its resume token cannot continue the original
run. If the same message is still sent, Kortyx ignores the expired resume
metadata and lets the application handle it as normal input. An application
fallback may therefore start a new run, but it did not resume the expired run.
Kortyx Studio preserves that distinction.

## Static choices and dynamic pickers

An interrupt can obtain choices in two ways:

- a **static choice** embeds its options in the interrupt request;
- a **dynamic picker** sends a `schemaId` and lets the client resolve options
  from its own data source.

A dynamic picker can therefore have `optionCount: 0` in telemetry even when the
client shows valid choices. The count describes options embedded by the server,
not the number rendered by the client.

See [Runtime Persistence Adapters](../04-production/02-framework-adapters.md).

## Complete a response before execution finishes

See [Background Continuation](/docs/guides/background-continuation) for `completeResponse()`, independent execution lifetime, and discovering human requests through `agent.listInterrupts()` without Studio. A `done` chunk ends client delivery; it does not prove successful execution.
