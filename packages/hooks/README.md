# @kortyx/hooks

[![npm version](https://img.shields.io/npm/v/@kortyx/hooks.svg)](https://www.npmjs.com/package/@kortyx/hooks)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/hooks.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

Node-level hooks for model calls, human-in-the-loop interrupts, structured stream data, runtime context, and durable node/workflow state.

Most application code should import these APIs from `kortyx`. Use `@kortyx/hooks` directly when you want the hook package without the full facade.

## Install

```bash
pnpm add @kortyx/hooks
```

```bash
npm install @kortyx/hooks
```

## Key APIs

- `useReason(...)` for model calls, optional schema-constrained interrupt flow, and structured output.
- `useInterrupt(...)` for explicit human-in-the-loop pauses.
- `useStructuredData(...)` for UI-friendly structured stream events.
- `defineOutputContract(...)` for reusable model-selected and application-authored structured values.
- `useRuntimeContext(...)` for request context made available to node execution.
- `useNodeState(...)` / `useWorkflowState(...)` for stateful node logic.

Define reusable model-driven human-input contracts with
`defineInterruptContract(...)`, then pass one or more through
`useReason({ interrupts: { contracts } })`. Contract calls share the ordinary
tool loop, so tools can run before and after a pause. Use `mode: "optional"`
when the model may finish without asking, and `maxRequests` to bound sequential
human turns.

The singular `useReason({ interrupt })` option and `result.interruptResponse`
are deprecated and will be removed in the next major release. Migrate to
`interrupts.contracts` and `result.interruptHistory`.

Pass output contracts through `useReason({ outputs: { emit, return } })` to let
the model emit values between text segments or choose a typed terminal result.
Contracts with `stream.fields` start a separate streamed JSON pass and publish
partial `set`, `append`, or `text-delta` updates before the validated `final`
value. `useStructuredData({ contract, data })` uses the same stream contract for
application-authored values. The older `outputSchema` and `structured` options
and `result.output` remain available during migration, but are deprecated and
scheduled for removal in the next major release. TypeSafe Jev's provider-native
decision schema is a temporary exception until a non-tool replacement ships.

## Mixed tools, outputs, and interrupts

A model turn may request multiple domain tools, `emit` outputs, and interrupt
contracts together. They run in the requested order, so an emitted card can
appear before a question about it. Each interrupt pauses the remaining calls;
resume reuses completed tool results, emissions, and human responses. Tool
approval still applies, and `interrupts.maxRequests` and `outputs.maxEmissions`
still bound their respective calls.

A terminal `return` runs after every other call in that turn, regardless of its
position. When an output follows domain or interrupt results from the same turn,
Kortyx generates its value in a separate schema-constrained model pass using
those results, rather than publishing the original draft. Streamed contracts use
their normal streamed generation pass; other contracts use a buffered pass.
These passes, including failed attempts, consume `toolExecution.maxSteps` across
resume. Budget exhaustion throws a `ProviderRequestError` with code
`REASON_OUTPUT_BUDGET_EXHAUSTED` and guidance to increase `maxSteps`.

There is one terminal `result.returned` value. If the model requests multiple
returns, each receives an error result asking the model to select one. Other
calls proceed normally, and completed calls are not replayed for correction.
Correction consumes the remaining `maxSteps`; exhaustion throws a typed
`REASON_OUTPUT_CONTRACT_CORRECTION_EXHAUSTED` failure. Multiple `emit` outputs
are supported without this restriction.

## Runtime Resume Behavior

On resume, the node function is replayed from the top.

- `useReason` resumes from its internal checkpoint.
- Code before `useReason` will re-run unless guarded.

Workarounds:

- Keep nodes minimal and call `useReason` first.
- Guard pre-`useReason` side effects with `useNodeState`.

## Documentation

- [Documentation](https://kortyx.io/docs)
- [Hooks](https://kortyx.io/docs/core-concepts/hooks)
- [Interrupts and resume](https://kortyx.io/docs/guides/interrupts-and-resume)
- [Runtime persistence](https://kortyx.io/docs/production/persistence)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).


## Child workflows

Call a registered workflow from a node or custom hook and continue with its
result:

```ts
const result = await useWorkflow({
  id: "research",
  workflow: researchWorkflow,
  input: { topic: "AI agents" },
});
return { data: { summary: result.data.summary } };
```

The child defines `inputSchema` and `outputSchema` on `defineWorkflow`.
Inputs and returned data are inferred from those schemas and validated at
runtime. The result is the child's accumulated data parsed by its output
schema. Use `createWorkflowHooks({ research: researchWorkflow })` for typed
string ids. Register the same definitions with the agent.

Calls need stable ids. A child interrupt pauses the chain; resuming replays
the enclosing node and reuses saved child results. Keep effects before calls
idempotent. Fork/rollback retain nested checkpoints; use Redis for persistence
across server restarts. Join concurrent children with `parallel`:

```ts
const [first, second] = await parallel([
  useWorkflow({ id: "first", workflow: researchWorkflow, input: { topic: "AI" } }),
  useWorkflow({ id: "second", workflow: researchWorkflow, input: { topic: "Robotics" } }),
]);
```

The tuple follows input order. The join preserves all siblings before pausing and
presents waiting questions individually through the parent handle. Terminal group
failures throw `ParallelError`, whose `results` exposes each settled outcome.
Await groups sequentially within one node; children may contain nested groups.
Native `Promise.all` calls and parallel graph edges remain unsupported.

See [the execution and replay contract](../../docs/design-specs/child-workflows.md).
