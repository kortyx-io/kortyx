# Child workflow hooks

Implemented API and replay contract.

## Calling a workflow

A node or custom hook calls a workflow registered with its agent and awaits
its result. It then continues normally and returns its own `NodeResult`.
No new graph node type, call edge, or return node is needed.

```ts
const researchWorkflow = defineWorkflow({
  id: "research",
  version: "1.0.0",
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({
    summary: z.string(),
    sources: z.array(z.string()),
  }),
  nodes: {
    summarize: {
      run: async ({ input }) => ({
        data: { summary: input.topic, sources: [] },
      }),
    },
  },
  edges: [["__start__", "summarize"], ["summarize", "__end__"]],
});

async function reportNode({ input }) {
  const result = await useWorkflow({
    id: "research",             // Stable identity of this call in the node.
    workflow: researchWorkflow, // A typed reference; resolved through the registry.
    input: { topic: input.topic },
  });
  return { data: { report: result.data.summary } };
}
```

Register both workflows through the existing `createAgent({ workflows })`
API. The runtime resolves the child by id and verifies the typed reference
uses the registered version and schema objects. It never executes an
unregistered definition supplied by the caller.

For typed string ids, bind the hook to the same definitions:

```ts
const { useWorkflow } = createWorkflowHooks({ research: researchWorkflow });

async function useResearch(args: { id: string; topic: string }) {
  const result = await useWorkflow({
    id: args.id,
    workflow: "research",
    input: { topic: args.topic },
  });
  return result.data; // { summary: string; sources: string[] }
}
```

The factory checks input types and infers results from schemas, rather than
accepting a caller-provided result type assertion. The unbound hook also
accepts dynamic string ids, but their input is `unknown` and returned data is
`Record<string, unknown>`; runtime validation still applies.

Callable workflows require `inputSchema` and `outputSchema`. Existing root
workflows can omit them. Child input is parsed before execution, and the
child's accumulated `GraphState.data` is parsed by `outputSchema` at completion.
Schemas apply their normal Zod behavior: use `.passthrough()` to retain extra
accumulated fields, or an ordinary object schema to expose selected fields.
Transforms execute once. Internal runtime/checkpoints/UI metadata are excluded.
Inputs and results must contain JSON values.

## State and control flow

Every child receives fresh graph data and hook state. Parent input/data is
not implicitly copied or merged. Server-provided runtime context, providers,
and tracing are inherited; the caller decides which returned fields to use.
On resume, the saved execution context is retained so changing client history
or picker context does not change the enclosing node's routing decisions.
Applications must still authorize each request before invoking the agent.

Children may call children and a node may await multiple children in order.
Each call needs a distinct stable id within that node activation, including
inside loops/custom hooks. Re-entering a node through a graph loop starts a
fresh activation. Calls are limited to 16 nested levels and 64 calls per node
activation. Overlapping calls and parallel edges in calling/called workflows
are unsupported and rejected.

`transitionTo` remains a root-workflow handoff. A child must finish and return;
a transition from inside a child fails explicitly. A failed child rejects
with `WorkflowCallError`, which the parent can catch. Retrying the parent
reuses the recorded child outcome. Intentional child retries need a distinct
stable attempt id and an application-owned bounded policy.

## Interrupt and replay model

A child uses the same `useInterrupt` or `useReason({ interrupt })` APIs as a
root. When it pauses, its graph checkpoint and pending writes are packed into
the parent's hook state and its human request is bridged through the parent.
Nested pauses recursively contain the full waiting chain.

After a pause, the enclosing parent node replays. At each saved call id, the
hook resumes the interrupted child or returns a completed child's cached
result. Completed earlier graph nodes do not rerun. Replaying a call with
changed input or a changed typed workflow version fails explicitly.

The hook replays its prior bridged interrupts even after the child finishes,
so the parent engine's positional resume values stay aligned when several
children and later parent interrupts appear in one node. Results remain
cached until parent node completion. Completion uses tombstones because the
runtime's recursive reducer would otherwise preserve deleted cache entries
when a graph loops back to the same node.

Suspension bypasses node retries. If user code catches the internal suspension
signal, the node boundary rethrows it before committing a fallback result.
Terminal child errors remain catchable. Code before the call, including code
between calls and in catch/finally blocks, may execute again: keep external
writes idempotent or in separate checkpointed nodes. This is not exactly once
execution of arbitrary JavaScript or external effects.

## Persistence, fork, and rollback

Children run through the existing graph compiler with private checkpoint
savers and isolated engine context. Their snapshots are serialized into the
parent, rather than maintained in a separate distributed invocation service.
This keeps the whole paused chain within one durable parent snapshot.

Pending requests retain an immutable root graph snapshot, including pending
writes. Resuming restores that copy and rebinds runtime services. Both memory
and Redis stores atomically consume resume tokens; stale tokens and requests
for a different session fail instead of starting a new chat run. Cancelling
an interrupt ends that execution without restarting its parent.

Forks of snapshot-backed executions receive a new run id and resume tokens.
Each branch restores its own graph storage. Rollback restores the selected
snapshot and replaces later engine writes, including Redis writes that could
otherwise incorrectly reuse the completed branch. Snapshots retained by the
session store remain usable after ephemeral graph cleanup. Legacy records
without graph snapshots retain the previous compatibility path.

Durability is at graph/human-interrupt checkpoints. A process can restart while
a child is paused and resume through Redis. This does not add a background
scheduler, distributed locking for all session operations, or a promise to
resume arbitrary in-flight JavaScript after a crash. Serialize concurrent
rollback/fork/edit operations at the application/session boundary.

## Streaming and tracing

Children share the root client stream. Their terminal completion is consumed
internally; only the parent execution ends the stream. Child stream/node ids
are scoped to invocation identities, preserving structured-output isolation.
`kortyx.workflow.call` spans carry the child workflow id, call id, and invocation
id. Child traces must not inherit the parent's workflow revision identity.
Actual call relationships come from runtime traces; dynamic calls inside
custom hooks are not inferred by parsing source or requiring topology edges.

## Validation

Automated tests cover typed input/result inference, runtime schema failures
and transformations, state isolation, sequential and nested interrupts,
completed sibling reuse, caught failures and suspension, graph loops,
concurrent resume claims, cancellation, stale tokens, fork independence,
rollback, and both in-memory and real Redis persistence.

The canvas example calls its registered creation, brief-query, update, and
save workflows from nodes. Its update fallback calls save as a nested child.
A deterministic canvas test forks the real save-confirmation workflow and
resumes both branches. Live browser verification exercises creation pickers,
a fork with a different brief, streaming canvas generation, and server restart
while the original child is paused, followed by save confirmation and completion.
