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
- `useRuntimeContext(...)` for request context made available to node execution.
- `useNodeState(...)` / `useWorkflowState(...)` for stateful node logic.

`useReason({ interrupt })` defaults to required interrupt behavior. Use
`interrupt.mode: "optional"` when the model should decide whether to continue
with a single model call or pause for user input.

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
