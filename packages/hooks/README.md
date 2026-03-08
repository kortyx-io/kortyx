# @kortyx/hooks

Lifecycle hooks and extension points for Kortyx.

## Install

```bash
npm install @kortyx/hooks
```

## Key APIs

- `useReason(...)` for model calls, optional schema-constrained interrupt flow, and structured output.
- `useInterrupt(...)` for explicit human-in-the-loop pauses.
- `useStructuredData(...)` for UI-friendly structured stream events.
- `useNodeState(...)` / `useWorkflowState(...)` for stateful node logic.

## Runtime Resume Behavior

On resume, the node function is replayed from the top.

- `useReason` resumes from its internal checkpoint.
- Code before `useReason` will re-run unless guarded.

Workarounds:

- Keep nodes minimal and call `useReason` first.
- Guard pre-`useReason` side effects with `useNodeState`.

## Documentation

- Runtime hooks: `apps/website/src/docs/v0/03-runtime/01-hooks.md`
- Interrupts/resume: `apps/website/src/docs/v0/03-runtime/02-interrupts-and-resume.md`

## License

Apache-2.0
