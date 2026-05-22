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

Or use `useReason({ interrupt: ... })` when you want model-generated interrupt requests constrained by schema. By default, `useReason` treats interrupt config as required: the model must produce an interrupt request, the runtime pauses, and the hook continues after resume. Set `interrupt.mode` to `"optional"` when the model should return either `decision: "continue"` for a single-call result or `decision: "interrupt"` with an interrupt request.

> **Good to know:** Use required interrupts for approvals and safety gates. Optional interrupts are best for flows where the model can answer immediately but may ask for user input when the request is ambiguous.

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

See [Runtime Persistence Adapters](../04-production/02-framework-adapters.md).
