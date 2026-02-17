---
id: v0-runtime-interrupts-resume
title: "Interrupts and Resume"
description: "Pause node execution for user input and resume deterministically using tokens and request ids."
keywords: [kortyx, interrupt, resume, human-input, pending-requests]
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

## Persistence requirements

Resume only works if the framework adapter persists pending requests + checkpoints.

- in-memory adapter: good for local dev, not restart-safe
- redis adapter: recommended for production resume

See [Framework Adapters](./04-framework-adapters.md).
