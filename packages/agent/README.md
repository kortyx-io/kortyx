# @kortyx/agent

[![npm version](https://img.shields.io/npm/v/@kortyx/agent.svg)](https://www.npmjs.com/package/@kortyx/agent)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/agent.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

Agent creation, chat route handlers, HTTP helpers, and stream orchestration for Kortyx.

Most application code should import these APIs from `kortyx`. Use `@kortyx/agent` directly when you are building framework adapters or want the lower-level agent package without the full facade.

Topology identity excludes handoffs inferred from JavaScript function source, so
source publication and bundled execution share a revision even when bundling hides
a target. Inferred handoffs and source-discovered child links remain catalog
metadata. After upgrading the SDK and CLI, rebuild the application and republish
its source catalog. Previously inferred handoffs can receive a new topology hash
once; historical revisions and run references remain readable without migration.

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

`createEvalJudge` publishes its static instructions in the judge identity and
saved results for Studio inspection. Custom judges can provide optional
`instructions` (1–64,000 characters): only the static instructions actually used,
without secrets or per-case data. Change the judge version when they change.
Older/custom results without this field remain readable. Upgrade API and Studio
together before SDK consumers that publish instruction snapshots; older strict
readers do not support the added identity field.

Updated judge response readers ignore additional fields while validating known
fields and pinning the judge identity. The Studio API keeps legacy judge HTTP
responses in their original shape unless the caller opts in with
`includeInstructions=true`; current SDK clients already send that option.
Studio eval target reads negotiate judge metadata through the existing
`x-kortyx-studio-api-version` header. Request/configuration validation remains
strict. This does not make arbitrary skipped-version upgrades compatible.

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

Eval issues preserve declared-safe failures and native diagnostic references.
Configure native diagnostic capture on the agent to inspect original hook errors
in Studio. Use `verify` for postconditions (false means Failed), and `teardown` for
reset (a thrown fault means Error). Setup, execution and verification have separate
cooperative budgets. See [eval error migration](../../docs/evals/error-contract-migration.md)
before upgrading a mixed SDK/API/Studio deployment.

## Evaluation execution recovery

`createEvalRouteHandler` supports queued, idempotent execution with cursor-based
observation and explicit cancellation. Reuse a PostgreSQL framework adapter with
`executionStore: persistence.evalExecutions`; it shares the workflow adapter's
connection pool, namespace, `maintenance.setup()` and `close()`. Optional Redis
checkpoint caching preserves this capability and is not required for evals.
Explicitly pass it to the route even when the agent already uses PostgreSQL.
All replicas need the same database, stable namespace, service key and limits.
Standalone `createPostgresEvalExecutionStore` remains supported for an independent
eval pool. The default memory store only survives within its process. See
[execution resilience](../../docs/evals/execution-resilience.md) for configuration,
retention, legacy compatibility and upgrade order.

For planned retirement, `await handleEvals.drain()` stops new admissions and
finishes accepted local/queued executions without aborting them. Keep HTTP and
the store open for observation/cancellation; `close()` remains explicit abort.
With one consumer, drain Studio workers first while the consumer still accepts
later cases, then drain the consumer after Studio persists results. Overlapping
consumers require a compatible replacement and shared durable execution storage.
The built-in stores support this; custom `EvalExecutionStore` implementations need
`queued` and `claimQueued` for drain. Upgrade agent and runtime together. See the
linked guide for ordering, failure handling and resource lifetime.

### Evaluation settings and errors

`createEvals` supports `defaults: { repetitions, concurrency, caseTimeoutMs }`,
`limits: { concurrency, caseTimeoutMs }`, and per-run `caseTimeoutMs` overrides.
Studio resolves run overrides above project defaults, SDK defaults and built-ins;
its whole-evaluation timeout is independent of the case budget (30 minutes by
default). Eval failures retain original messages, stacks, causes and response
properties with credential redaction automatically. See the repository guides
[SDK evals](../../docs/evals/sdk-runner.md) and
[Studio settings and migration](../../docs/evals/studio-execution.md).

## Deterministic eval checks

Import `evalChecks` with `defineSuite` and add `expect.checks`, for example
`[evalChecks.textContains("EUR"), evalChecks.toolCalled("catalog.lookup")]`.
For an exact answer, use `evalChecks.textEquals("sales")`; pass
`{ ignoreCase: true }` as the second argument to ignore case without trimming whitespace.
Built-in text, regex, tool-input, and structured-output equality checks execute
before semantic judging in both App and Studio modes, with no callback registry
or extra `createEvals` configuration. Check-only local suites need no model judge.
Use `verify` for final application-state postconditions. See
[the SDK runner guide](https://github.com/kortyx-io/kortyx/blob/main/docs/evals/sdk-runner.md#deterministic-checks)
for evidence boundaries, saved verdicts, and mixed-version upgrade order.
