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
- `createEvals(...)`
- `defineSuite(...)`
- `createEvalJudge(...)`
- `createStudioEvalJudge(...)`
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

## Tool evidence in evals

Enable `toolExecution: { emit: true }` on workflow `useReason` calls when eval
criteria rely on tool activity or retrieved facts. `createEvals` captures those
existing stream events and supplies them, along with the answer and previous
conversation steps, to the judge. See the conversation eval guide below for
examples and the capture boundary.

Use `createEvalJudge({ model })` to grade in the app, or
`await createStudioEvalJudge({ url, apiKey, environment })` to use the Studio
backend's configured judge. Both fit the same `createEvals({ ..., judge })`
slot. Provider credentials stay where the judge runs.

## Documentation

- [Conversation evals: SDK runner](https://github.com/kortyx-io/kortyx/blob/main/docs/evals/sdk-runner.md)
- [Main package README](https://github.com/kortyx-io/kortyx/tree/main/packages/kortyx)
- [Documentation](https://kortyx.io/docs)
- [Package overview](https://kortyx.io/docs/reference/package-overview)
- [Create agent](https://kortyx.io/docs/core-concepts/create-agent)
- [Stream chat](https://kortyx.io/docs/core-concepts/stream-chat)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).

## Conversation eval outputs

A step can require multiple completed structured output contracts with
`expect.outputs: [{ schemaId: "app.product-list" }, { schemaId: "app.product-summary", schemaVersion: "1" }]`.
Versions are optional. These deterministic checks run before semantic criteria
and only match finalized visible outputs from the current step. See the
[conversation eval guide](https://kortyx.io/docs/guides/conversation-evals) for
SDK setup, Studio execution and custom executor requirements.
