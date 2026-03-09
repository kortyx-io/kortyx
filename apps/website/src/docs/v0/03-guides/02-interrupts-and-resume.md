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

Or use `useReason({ interrupt: ... })` when you want model-generated interrupt requests constrained by schema.

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

```ts
{
  role: "user",
  content: "Product",
  metadata: {
    resume: {
      token: "<resumeToken>",
      requestId: "<requestId>",
      selected: ["product"]
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
  useStructuredData({ dataType: "lifecycle", mode: "snapshot", data: { step: "start" } });
  setStartEmitted(true);
}

const result = await useReason({ ... });
setStartEmitted(false);
```

## Persistence requirements

Resume only works if the framework adapter persists pending requests + checkpoints.

- in-memory adapter: good for local dev, not restart-safe
- redis adapter: recommended for production resume
- hook state (`useNodeState` / `useWorkflowState`) follows the same checkpoint lifetime and limits

See [Framework Adapters](../04-production/02-framework-adapters.md).
