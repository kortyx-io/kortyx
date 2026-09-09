# Child Workflow Implementation

Use this reference when a node or custom hook must call another registered workflow, await its output, then continue the parent. Confirm the installed `kortyx` version exports `useWorkflow` and `createWorkflowHooks` before using this API. Older releases may only support handoffs.

## Choose the control flow

- Use `useWorkflow` when the caller needs a child result and continues afterward.
- Keep `transitionTo` for root workflow handoffs with no return to the caller.
- Calls belong in node/custom-hook code. Do not introduce call-node declarations, return edges, a second agent, or a separate child resume endpoint.
- A callable workflow defines input/output schemas. This contract does not declare its possible callers.

## Implement the contract and hook

```ts
import { createAgent, createWorkflowHooks, defineWorkflow } from "kortyx";
import { z } from "zod";

const ResearchInput = z.object({ topic: z.string() });
const ResearchOutput = z.object({ summary: z.string() });

const researchWorkflow = defineWorkflow({
  id: "research-workflow",
  version: "1.0.0",
  inputSchema: ResearchInput,
  outputSchema: ResearchOutput,
  nodes: {
    summarize: {
      run: async ({ input }: { input: z.output<typeof ResearchInput> }) => ({
        // Replace with application research/model work.
        data: { summary: `Research about ${input.topic}` },
      }),
    },
  },
  edges: [["__start__", "summarize"], ["summarize", "__end__"]],
});

const { useWorkflow } = createWorkflowHooks({
  "research-workflow": researchWorkflow,
});

async function useResearch(args: { id: string; topic: string }) {
  const result = await useWorkflow({
    id: args.id,
    workflow: "research-workflow",
    input: { topic: args.topic },
  });
  return result.data;
}

const reportWorkflow = defineWorkflow({
  id: "report-workflow",
  version: "1.0.0",
  nodes: {
    report: {
      run: async ({ input }: { input: unknown }) => {
        const result = await useResearch({ id: "research", topic: String(input) });
        return { data: { report: result.summary.toUpperCase() } };
      },
    },
  },
  edges: [["__start__", "report"], ["report", "__end__"]],
});

export const agent = createAgent({
  workflows: [reportWorkflow, researchWorkflow],
  defaultWorkflowId: "report-workflow",
});
```

Use the same definition objects in both registries. Keep definitions inferred from `defineWorkflow`; annotating them as the broad `WorkflowDefinition` loses concrete schemas. Input uses `z.input` and output uses `z.output`; transformed schema inputs may differ from what a child node receives.

The unbound `useWorkflow` imported from `kortyx` can take `workflow: researchWorkflow` directly for the same inference. Dynamic unbound string IDs return `Record<string, unknown>`; do not cast a guessed output type. JSON/YAML cannot embed executable Zod schemas: attach contracts in a TypeScript/JavaScript definition when migrating file-based workflows.

## Return the child's data

The last child node returns ordinary `{ data: ... }` and reaches `__end__`. The runtime parses accumulated child data with `outputSchema`, and the parsed object becomes `result.data`. Do not return `transitionTo` from a child or invent a `returnTo` command.

An object schema selects the public fields; `.passthrough()` retains extra accumulated fields. Node implementations still need to produce valid results; caller inference does not statically validate every node's output. Input transforms run on initial invocation and output transforms on completion. Replay returns cached parsed values.

Parent and child have isolated input/data and node/workflow state. Pass explicit business input. Runtime context and providers are inherited. The parent decides which child fields enter its own `{ data }` result.

## Preserve replay semantics

- Await calls sequentially. No overlapping `Promise.all` calls or parallel edges in calling/called graphs.
- Give each call a distinct stable ID in the current node activation. A helper accepts its ID from its caller. Do not generate IDs randomly or from timestamps during replay.
- Keep call order, target, and input stable through pauses. A graph loop re-entering a completed node creates a fresh invocation even with the same call ID.
- Use ordinary `useInterrupt` or `useReason({ interrupt })` in children. Continue using the parent's existing transport and human-input UI.
- Completed child nodes and completed sibling calls are restored/cached. Surrounding parent code, and the child's currently interrupted node, can replay. Avoid repeating model/service work there without a resumable hook or an appropriate guard.
- External writes need idempotency keys or application transactions. A `useNodeState` flag and an external write are not atomic with each other. Moving a write after an interrupt does not by itself protect it from a later pause or rollback.
- A `WorkflowCallError` can be handled by the parent. A suspension is control flow and must propagate; catching it cannot commit fallback output. Cached child failures are reused on parent retry. A deliberate child retry uses a distinct stable attempt ID and a bounded policy.
- Input/output must be JSON values. Reject undefined, non-finite numbers, dates, maps, functions, and cycles. Keep snapshots small. Limits: 16 nested levels, 64 calls per node activation.

## Persistence and branches

Use one framework adapter on the parent agent. Child checkpoints are carried inside the parent snapshot; do not configure a separate child store. Use Redis for pauses that must survive restarts or multiple server workers, and choose TTL/retention for the application's pause duration.

Fork/rollback uses the existing session checkpoint APIs. Snapshot-backed forks have independent run IDs and tokens while preserving the waiting call chain. They may reuse invocation IDs from their source; do not treat `invocationId` alone as globally unique across forks. Restoring runtime state does not undo external writes.

Saved runtime context is retained on resume so new client history/picker values do not reroute an interrupted call. Reauthorize each request at the server boundary. Deploying a different child version can reject resume: retain compatible registered definitions or provide an explicit application restart path, rather than pretending to load historic code.

Built-in memory and Redis stores claim tokens atomically. Expired, consumed, cancelled, and cross-session tokens fail. Selecting an app-defined Cancel choice resumes ordinary logic; protocol cancellation ends the waiting execution. Serialize concurrent rollback/fork/edit operations in the application.

## Migrate an existing handoff

1. Identify the data the caller needs and define the child's schemas around that result.
2. Replace the parent's `{ transitionTo: childId }` with an awaited call; return the fields needed by later parent nodes.
3. Replace handoffs inside the child with nested calls. Remove declarations that claimed those calls were root handoffs, if present.
4. Register all definitions on the same agent and update changed workflow versions.
5. Keep client interrupt and checkpoint transports. Avoid duplicate final messages when children already stream UI output.
6. Exercise the real example/app with child pauses and both branches of a fork.

## Verify the implementation

Choose coverage based on the application's call shape. For a reusable framework change, cover typed IDs/input/output, runtime invalid results, a child interrupt followed by a later parent interrupt, nested grandchildren, cached siblings, retries, and state isolation. Fork a waiting child and give branches different answers; then restore a checkpoint and edit the response. Reconstruct the agent with Redis to verify actual persistence, and test duplicate/stale tokens and cancelled requests.

When running Redis tests through a task runner, verify the Redis URL reaches the test process and the Redis cases actually ran. A green suite that skipped them is insufficient evidence of durable replay.

Studio's **Execution** tab groups logical calls under their caller, including nested nodes and generations. Enable **Include child workflows** in Runs for searchable child rows; use **Observed calls** on the workflow canvas for runtime call/return links. Publish both parent and child definitions, then generate real traffic. No static call declarations are needed.

Implementation invariants: lifecycle facts distinguish started, suspended, resumed, completed, failed, reused, and restored. Keep `invocationId` stable during replay; use `(runId, branchId, invocationId)` for identity across forks/rollback. Sequence numbers are local to the call and branch. Keep restored evidence separate from new generation costs; never infer a successful child result from an attempt span ending. Reuse the application's content-capture policy and never send snapshots or resume tokens in call events. Child topology registration must resolve the child's revision, never inherit the parent's revision.

Verify Studio with a completed child, a waiting leaf, divergent fork answers, and a cached sibling. Check parent links and pagination with the child toggle enabled. Public implementation guide: `https://kortyx.io/docs/guides/child-workflows` (when the containing SDK/docs release is available).
