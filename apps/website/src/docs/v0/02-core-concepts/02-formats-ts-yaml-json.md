---
id: v0-workflow-formats
title: "Formats (TS, YAML, JSON)"
description: "Author workflows in TypeScript, YAML, or JSON and understand how Kortyx loads each format."
keywords: [kortyx, typescript, yaml, json, workflow-loader]
sidebar_label: "Formats (TS, YAML, JSON)"
---
# Formats (TS, YAML, JSON)

Kortyx currently supports all three authoring formats.

| Format | Best for | Notes |
| --- | --- | --- |
| TypeScript | app codebases | best DX, direct node imports |
| YAML | declarative workflow files | human-readable, comments |
| JSON | generated/exported configs | machine-friendly |

> **Good to know:** Exact handler resolution rules for `run` strings are documented in [Node Resolution](../05-reference/05-node-resolution.md).

## TypeScript

```ts
import { defineWorkflow } from "kortyx";
import { chatNode } from "@/nodes/chat.node";

export const wf = defineWorkflow({
  id: "general-chat",
  version: "1.0.0",
  nodes: {
    chat: { run: chatNode, params: {} },
  },
  edges: [
    ["__start__", "chat"],
    ["chat", "__end__"],
  ],
});
```

## YAML

```yaml
id: general-chat
version: 1.0.0
nodes:
  chat:
    run: ../nodes/chat.node.ts#chatNode
    params: {}
edges:
  - ["__start__", "chat"]
  - ["chat", "__end__"]
```

## JSON

```json
{
  "id": "general-chat",
  "version": "1.0.0",
  "nodes": {
    "chat": {
      "run": "../nodes/chat.node.js#chatNode",
      "params": {}
    }
  },
  "edges": [["__start__", "chat"], ["chat", "__end__"]]
}
```

## How loading works in current packages

- `@kortyx/core/loadWorkflow` parses `string | Buffer | object`
- JSON text starts with `{` / `[` and is parsed as JSON
- otherwise it is parsed as YAML (`js-yaml`)
- `@kortyx/runtime/createFileWorkflowRegistry` scans these file extensions:
  - `.workflow.ts`, `.workflow.mts`, `.workflow.js`, `.workflow.mjs`
  - `.workflow.json`, `.workflow.yml`, `.workflow.yaml`
