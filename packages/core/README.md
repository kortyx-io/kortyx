# @kortyx/core

[![npm version](https://img.shields.io/npm/v/@kortyx/core.svg)](https://www.npmjs.com/package/@kortyx/core)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/core.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

Workflow definitions, node contracts, state types, schema validation, and workflow loading primitives for Kortyx.

Most application code should import these APIs from `kortyx`. Use `@kortyx/core` directly when you are building lower-level framework integrations or package-level extensions.

## Install

```bash
pnpm add @kortyx/core
```

```bash
npm install @kortyx/core
```

## Key APIs

- `defineWorkflow(...)`
- `loadWorkflow(...)`
- `validateWorkflow(...)`
- `NodeFn`
- `NodeResult`
- `WorkflowDefinition`
- `GraphState`

## Example

```ts
import { defineWorkflow } from "@kortyx/core";

export const workflow = defineWorkflow({
  id: "support-triage",
  version: "1.0.0",
  nodes: {
    classify: { run: "classifyTicket" },
    respond: { run: "draftResponse" },
  },
  edges: [
    ["__start__", "classify"],
    ["classify", "respond"],
    ["respond", "__end__"],
  ],
});
```

## Documentation

- [Documentation](https://kortyx.io/docs)
- [Define workflows](https://kortyx.io/docs/core-concepts/define-workflows)
- [Workflow formats](https://kortyx.io/docs/core-concepts/formats-ts-yaml-json)
- [Package overview](https://kortyx.io/docs/reference/package-overview)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
