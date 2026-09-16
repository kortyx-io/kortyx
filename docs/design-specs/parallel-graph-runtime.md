# Parallel graph runtime

Implementation: acyclic parallel graphs, 2026-09-16.

## Contract

- Keep ordinary workflow definitions, edges and `useWorkflow` calls unchanged.
- All selected incoming predecessors are required. Unselected conditional paths
  become skipped, not failed or indefinitely waiting.
- Each node receives its dependency data only. Disjoint top-level fields merge.
  Incomparable writers for a field fail the shared consumer before execution with
  `GRAPH_OUTPUT_CONFLICT`, naming the consumer, field and writers. No renaming,
  silent overwrite, equality-based winner or automatic fallback. A writer in the
  other writer's ancestor chain is an ordinary sequential update.
- Ordinary failures are activation outcomes after existing configured retries.
  Independent work continues; selected required dependents fail before their
  business code runs with `GRAPH_DEPENDENCY_FAILED` and a preserved cause. The root
  ultimately fails if any branch failed. Application fallback must be explicit.
- Human and allowance pauses are control flow, not terminal branch failures.
  Whole-root cancellation signals and drains admitted work. Persistence failures
  do not become successful branch output.

## Ownership and scheduling

`createExecutionGraph` retains the existing node executor, hooks, trace spans,
child-call service, shared execution control and framework adapter. For a graph
with fan-out, internal work/wait/finish engine nodes own the root checkpoint.
They are not application topology and are hidden from progress messages. Real
node progress and call spans still use the original workflow/node identity.

The scheduler tracks a JSON journal per node, including responses, hook runtime,
selected outgoing edges, field writer provenance, history and terminal failure.
Node inputs and hook runtime are private copies. A ready node starts once all
potential predecessor routes are resolved and all selected predecessors finish.
As tasks settle, their ready successors can start without waiting for unrelated
running branches. Unequal-length paths therefore join exactly once.

`__end__` is the final consumer of active terminal paths, including implicit
conditional fallback/terminal nodes. It waits for all active branches and applies
the same field conflict rules. It never reports success while an active question
or required branch failure remains unresolved.

## Suspension and restoration

A branch uses a node-local positional interrupt journal. Its engine-control
signal is caught by the coordinator, retaining hook patches and nested child
snapshots without suspending independent branches. Completed nodes never replay.

After all runnable work drains, the work step checkpoints the entire root journal.
Only then does the wait step invoke one engine interrupt and publish the owning
node's question through the existing root transport. One engine task is waiting,
so an unkeyed legacy response cannot answer multiple branches. The wait step adds
the response to that node only. All other node questions remain waiting. A new
suspension revision exposes the next question through a fresh handle.

The graph request carries a root runtime patch, not the interrupted node's patch
as a root node-state envelope. Child workflow metadata remains scoped. Internal
patches/journals are filtered out of client question metadata.
Public completion chunks also omit the graph journal, so private sibling inputs
and nested checkpoint snapshots remain server-side. Journals belong to an
execution run: ordinary later chat turns start fresh, while explicit resume and
fork reconstruction retain saved progress.

Allowance exhaustion drains admitted siblings and attaches the entire journal to
the existing limit pause patch. Continue re-admits only limited nodes, retains
waiting nodes and reuses completed nodes. Per-node usage totals start at zero,
survive replay, and are summed once with the root's historical total. Cancellation
and terminal errors carry that same usage projection.

Memory and Redis use the same root graph snapshot and existing atomic token claim.
Fork/rollback copies the complete journal and retains existing branch/run rebasing.
No independent sibling resume tokens, distributed inbox or second executor is
introduced. Deployments must keep workflow versions compatible with saved state.

`completeResponse` snapshots settled graph progress plus the calling activation's
hook state. Incomplete concurrent activations are marked replayable; it is not a
micro-checkpoint or exactly-once external-effect guarantee.

## Boundaries

- Parallel graph back-edges fail explicitly with `GRAPH_CYCLE`. Sequential graphs
  and sequential loops inside child workflows retain their existing behavior.
  Cyclic parallel activation/join generations need a separately specified contract.
- Parallel branch `transitionTo` is rejected with `GRAPH_BRANCH_HANDOFF`; use
  `useWorkflow` to return without abandoning sibling work.
- Questions are sequentially presented, not batch-exposed. A running sibling can
  delay publishing the root's durable suspension.
- Optional dependencies, automatic branch recovery, in-flight process crash
  recovery and distributed live cancellation are not added.
- External effects need application idempotency/transactions; retries, active-node
  replay, forks and rollback do not undo or guarantee exactly-once writes.

## Verification

`packages/agent/test/parallel-graph.test.ts` exercises concurrent child starts,
dependency-only inputs, unequal-path barriers, field conflicts, branch-local
failure and retries, conditional skips, separate answers, advancing answered
branches, saved node/workflow state, memory/real-Redis reconstruction, divergent
fork answers, stale tokens, child graphs containing parallel edges, mixed
waiting/failure, shared allowances and usage, cancellation cleanup, and root
response completion followed by background approval. Existing sequential child,
parallel-group, execution, HTTP, stream and checkpoint tests remain regression gates.

### Application-level verification (2026-09-16)

The API-route example registers `parallel-graph-demo`, a real fan-out graph that
calls the existing research children without `parallel` wrappers. Manual browser
checks against the built SDK, Next.js and isolated Redis verified:

- Company approval advances its successor while role remains waiting and no join
  report appears. A separate role decline produces exactly one report with
  company=true and role=false.
- Conflicting outputs show the field and both writers; independent successors
  finish, but the join report does not execute.
- Company failure preserves role's question. Answering role runs its successor,
  then the join reports its failed required dependency.
- Forking the first approval checkpoint permits opposite answers and produces
  company=false and role=true, without reusing the parent's answers.
- Clicking an answered historical prompt is safely rejected. The example's
  existing UI still renders those controls as clickable, a separate UX rough edge.

`node examples/kortyx-nextjs-chat-api-route/scripts/parallel-api.e2e.mjs --graph`
passed nine HTTP checks, including a real Next.js process restart between pause
and resume, saved child operation/worker identity, distinct answers, stale handles,
shared allowance/Continue, conflicts, mixed waiting/failure and invalid commands.
The original wrapper-based runner also passed its seven regression checks. These
checks are deterministic and make no model-provider calls.
