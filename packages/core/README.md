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

## Workflow data reducers

Default node data merging is unchanged: objects deep-merge, arrays and scalars
are overwritten, and omitted fields persist. A workflow can declare `reduce`
callbacks typed from its `outputSchema` to replace, append or clear individual
fields. Callbacks must be pure, deterministic and synchronous; returning
`undefined` removes the field. Reducer failures use `WORKFLOW_REDUCER_FAILED` and
existing output validation remains in place.

See [workflow reducer contracts and examples](https://kortyx.io/docs/core-concepts/define-workflows#opt-in-data-reducers)
for chat/resume behavior, parallel ordering and child workflow boundaries. No
migration is required for workflows that do not opt in. Install the new
core/runtime packages on all workers before deploying reducer-enabled definitions
and bump the workflow version when changing callbacks.

## Documentation

- [Documentation](https://kortyx.io/docs)
- [Define workflows](https://kortyx.io/docs/core-concepts/define-workflows)
- [Workflow formats](https://kortyx.io/docs/core-concepts/formats-ts-yaml-json)
- [Package overview](https://kortyx.io/docs/reference/package-overview)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
