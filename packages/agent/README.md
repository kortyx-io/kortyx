# @kortyx/agent

[![npm version](https://img.shields.io/npm/v/@kortyx/agent.svg)](https://www.npmjs.com/package/@kortyx/agent)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/agent.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

Agent creation, chat route handlers, HTTP helpers, and stream orchestration for Kortyx.

Most application code should import these APIs from `kortyx`. Use `@kortyx/agent` directly when you are building framework adapters or want the lower-level agent package without the full facade.

## Install

```bash
pnpm add @kortyx/agent
```

```bash
npm install @kortyx/agent
```

## Key APIs

- `createAgent(...)`
- `createChatRouteHandler(...)`
- `handleChatRequestBody(...)`
- `parseChatRequestBody(...)`
- `streamChatFromRoute(...)`
- `streamChat(...)`
- `transformGraphStreamForUI(...)`

## Example

```ts
import { createAgent, createChatRouteHandler } from "@kortyx/agent";
import { defineWorkflow } from "@kortyx/core";

const workflow = defineWorkflow({
  id: "general-chat",
  version: "1.0.0",
  nodes: {
    answer: {
      run: async ({ input }) => ({ ui: { message: String(input ?? "") } }),
    },
  },
  edges: [
    ["__start__", "answer"],
    ["answer", "__end__"],
  ],
});

const agent = createAgent({
  workflows: [workflow],
  defaultWorkflowId: "general-chat",
});

export const handleChat = createChatRouteHandler({ agent });
```

## Documentation

- [Main package README](https://github.com/kortyx-io/kortyx/tree/main/packages/kortyx)
- [Documentation](https://kortyx.io/docs)
- [Package overview](https://kortyx.io/docs/reference/package-overview)
- [Create agent](https://kortyx.io/docs/core-concepts/create-agent)
- [Stream chat](https://kortyx.io/docs/core-concepts/stream-chat)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
