---
id: v0-create-agent
title: "createAgent"
description: "Set up createAgent with strict workflow/runtime config and explicit provider wiring in nodes."
keywords: [kortyx, createAgent, workflow-registry, config, runtime, strict]
sidebar_label: "createAgent"
---
# createAgent

`createAgent` is the high-level entrypoint for chat orchestration.

## Minimal usage

```ts
import { createAgent } from "kortyx";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";

export const agent = createAgent({
  workflows: [generalChatWorkflow],
  defaultWorkflowId: "general-chat",
});
```

```js
import { createAgent } from "kortyx";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";

export const agent = createAgent({
  workflows: [generalChatWorkflow],
  defaultWorkflowId: "general-chat",
});
```

Pass `sessionId` per request when you want analytics/tracing correlation across requests.

## Workflow source resolution

`createAgent` can resolve workflows from:

1. `workflowRegistry`
2. `workflows`
3. `workflowsDir`
4. fallback default: `./src/workflows`

Only one of `workflowRegistry`, `workflows`, or `workflowsDir` is allowed in the same config.

## Config knobs

Useful fields in `CreateAgentArgs`:

- `workflows` / `workflowRegistry` / `workflowsDir`
- `defaultWorkflowId`
- `frameworkAdapter`
- `getProvider` (advanced: custom provider registry lookup)

> **Good to know:** `createAgent(...)` does not manage business/data persistence for your app. Use your own DB or service clients inside node code, and use framework adapters only for runtime persistence such as interrupt/resume.

Result object:

```ts
const stream = await agent.streamChat(messages, options);
```

- `agent.streamChat(...)`: returns `AsyncIterable<StreamChunk>` (best for custom route handling)
