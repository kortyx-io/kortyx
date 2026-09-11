# Parallel child workflows

Status: initial child-call implementation in the working tree, 2026-09-11; not published.

The user confirmed `parallel`. This slice implements the eager array form, typed
tuples, `ParallelError.results`, shared limits/cancellation and durable child
snapshots with sequential presentation of questions through the existing parent
handle. It leaves concurrency caps, a settled variant, batch-answer resume, parallel
graph composition and the existing graph-interrupt bug for later. Sections below
retain the broader design analysis; explicitly proposed extensions are not shipped.

## Recommendation

Support concurrent registered children under one parent execution. The user's
preferred DX keeps ordinary `useWorkflow` calls as array elements, with a small
standalone helper replacing `Promise.all`. The chosen name is `parallel`.
Do not require a descriptor map or a helper attached to `useWorkflow`.
The helper uses the existing node/child runtime and checkpoint ownership.
`parallel` is a framework-aware join, not another workflow executor.

Keep workflow definitions, schema inference, provider configuration and registration
unchanged. Wolly owns its task DAG, waves and business decisions; Kortyx owns child
lifecycle, durable suspension, limits, cancellation and trace correlation.

Do not release a successful-path-only implementation as migration-ready. Parallel
children inside one sequential parent node and parallel graph edges are related
but separate capabilities, with separate release gates below.

## Baseline before implementation and evidence

The inspected checkout declares `kortyx@0.18.2`; the consumer reported `0.18.1`.

| Area | Current implementation | Consequence |
| --- | --- | --- |
| Child admission | `packages/hooks/src/workflow.ts`: `workflowCallActive` rejects overlap | The second concurrent call fails before execution |
| Graph topology | `packages/runtime/src/graph/call-workflow.ts`: `assertSequentialWorkflow` checks both graphs | Moving child calls to parallel graph nodes is also rejected |
| Child suspension | `WorkflowCallOutcome` and `ChildSnapshot` carry one request | A child with several waiting graph branches needs a request collection |
| Parent replay | `workflow.ts` replays bridged interrupts positionally | Arrival order cannot safely route concurrent child answers |
| Hook state | `packages/hooks/src/context.ts` stores one `{ nodeId, state }` envelope | Parallel graph-node activations need independent state slots |
| Graph updates | `create-execution-graph.ts` merges `data`, but also writes accumulated input to a single-value channel | Ordinary parallel data-producing nodes conflict |
| Limits | `packages/core/src/execution-limits.ts` synchronously reserves on one shared budget before dispatch | A useful existing foundation for concurrent work in one JS execution owner |
| Resume | `packages/agent/src/execution/types.ts` exposes one interrupt and request-scoped handle | Multiple questions need an explicit root suspension contract |
| Persistence | Pending stores atomically take one token; Redis updates otherwise read/modify/write | Independent sibling tokens would not serialize mutations of their common parent |
| Studio | Logical calls already use run/branch/invocation identity | Reuse this identity and extend lifecycle/projection handling |

A temporary deterministic runtime probe was run against `createExecutionGraph`:
two branches rendezvous before either completes. Both start concurrently when they
return `{}`. When they return distinct `{ data: { a: true } }` and
`{ data: { b: true } }`, invocation rejects with:

```text
Invalid update for channel "input" ...
LastValue can only receive one value per step.
```

Both characterization cases passed after matching the exact error wording. This
verifies the limitation, not the proposed feature. The temporary probe was removed.
It also narrows the earlier statement that general parallel workflows are supported:
parallel scheduling exists, but ordinary data merging is not generally safe yet.

A second temporary probe exercised `agent.execute` and `agent.resume` with two
parallel root nodes. Each asked a different text question through `useInterrupt`
and returned `{}` to isolate interrupt handling from the data-channel conflict:

- Both engine interrupts appeared in checkpoint pending writes.
- Kortyx persisted/exposed only one question, A.
- Answering A with `answer-for-first-only` resumed BOTH A and B with that text.
- The root returned `completed`; B was never independently answered.

This is a confirmed incorrect-answer-routing bug in the current in-memory direct
execution path. `wroteHumanInput` suppresses the second request in the orchestrator;
the resume handler passes an unkeyed scalar answer into the engine. Redis and chat
were not separately exercised by this probe. Separate root executions have separate
handles; this finding concerns branches sharing one root. The temporary probe was
removed. Add this exact case as an early regression test when implementing the fix.

## Developer experience and proposed extensions

The eager `parallel([...])` form below is implemented. The settled, factory and
multi-answer resume forms remain proposals.

### Independent children, then dependent work

The schema-bearing definitions are registered on the same agent:

```ts
import { parallel, useWorkflow } from "kortyx";

const [company, role] = await parallel([
  useWorkflow({
    id: "company",
    workflow: companyResearchWorkflow,
    input: { companyId },
  }),
  useWorkflow({
    id: "role",
    workflow: roleAnalysisWorkflow,
    input: { roleId },
  }),
]);

const plan = await useWorkflow({
  id: "plan",
  workflow: hiringPlanWorkflow,
  input: { company: company.data, role: role.data },
});

return { data: plan.data };
```

Both research children start before either finishes; the plan starts only after
both succeed. Preserve tuple inference and input order. Durable identity comes
from the explicit call IDs and node activation, not array position or completion
order. No public group ID is needed for this simple join.

The user selected `parallel`: short, readable, and independent of workflow definitions.

The helper must drain owned work to safe terminal/waiting states before propagating
failure or suspension; it must not abandon sibling promises. Suspension bypasses
normal success/error reconciliation. Root cancellation reaches all descendants.
A caught terminal failure retains application recovery semantics; an unhandled
parent failure cancels remaining owned work. Define mixed failure/waiting behavior
explicitly in implementation tests before release.

Native `Promise.all` child concurrency remains rejected. Use `parallel` to establish
group ownership before child dispatch. Node cleanup drains registered work before
checkpointing or retrying even if user code catches a rejection.

### Collecting each task's outcome

If Wolly needs terminal failure collection, a possible companion is
`parallel.settled`, keeping the same array of ordinary calls:

```ts
const [company, role] = await parallel.settled([
  useWorkflow({
    id: "company",
    workflow: companyResearchWorkflow,
    input: { companyId },
  }),
  useWorkflow({
    id: "role",
    workflow: roleAnalysisWorkflow,
    input: { roleId },
  }),
]);

if (company.status === "completed") {
  company.data; // Inferred company output.
}
if (role.status === "failed") {
  role.error; // Serializable terminal failure: code and message.
}
```

This is a mapped tuple of `{ status: "completed", data } | { status: "failed",
error }`, retaining each child's inferred output. The exact companion name is
secondary to the primary helper decision. Cancellation, suspension, limit exhaustion
and invalid invocation/replay commands are not terminal business task failures.
The helper propagates them before caller reconciliation.

Native `Promise.allSettled` catches every rejection, including suspension. The node
boundary can prevent false committed output, but cannot undo arbitrary external
side effects after a swallowed control signal. Do not recommend it for durable task
reconciliation. The same restriction applies to broad user-written catches.

### Bounded admission requires lazy calls

Array elements execute before `parallel` receives them. Consequently,
`parallel([useWorkflow(...), ...], { concurrency: 4 })` cannot honestly limit start
rate with today's eager promises. Do not implement a limit that only controls which
already-running promise is awaited, or silently change all child promises to lazy
thenables.

If bounded admission is required, consider a factory overload:

```ts
const [company, role] = await parallel([
  () => useWorkflow({
    id: "company", workflow: companyResearchWorkflow, input: { companyId },
  }),
  () => useWorkflow({
    id: "role", workflow: roleAnalysisWorkflow, input: { roleId },
  }),
], { concurrency: 2 });
```

The limit covers this group's directly running children, not descendants or global
model/tool work. Keep the existing maximum of 64 child calls per node activation
and depth 16 unless explicitly changed. Use the same helper with calls bound by
`createWorkflowHooks`; no extra registry or result casts.

Factories need stable order/membership, stable child IDs and replay-safe bodies.
Persist queued slot identity and validate its child identity when admitted. Arbitrary
factory bodies cannot all be validated without executing them; unlike descriptors,
this form cannot promise complete prevalidation before any child work starts.

### Wolly's existing waves

Schematic caller code with application-owned planning and reconciliation:

```ts
for (const wave of executionWaves) {
  const results = await parallel.settled(
    wave.tasks.map((task) => useWorkflow({
      id: `wave:${wave.id}:task:${task.id}`,
      workflow: taskWorkflow,
      input: task.input,
    })),
  );
  const outcomes = Object.fromEntries(
    wave.tasks.map((task, index) => [task.id, results[index]]),
  );

  reconcileWave(outcomes); // Pure logic, or idempotent persisted effects.
  if (!canContinue(outcomes)) break;
}
```

The example starts the entire wave. Use factories for a bounded wave if that overload
is adopted. Encode identity segments unambiguously in production. The application
validates the DAG and keeps wave/task inputs and identity stable through replay.
Earlier saved calls return cached outcomes; use separate checkpointed nodes where
appropriate. Kortyx does not replan the DAG, reinterpret failed prerequisites,
increase allowances or automatically retry failed tasks.

### Multiple approvals through the root

Proposed additive result/command shape:

```ts
const result = await agent.execute({ workflow: parentWorkflow, input });

if (result.status === "suspended") {
  // result.interrupts: Array<ExecutionInterrupt & { id: string }>
  // Display all pending questions; save result.resume privately.
  const selectedQuestion = result.interrupts[0]!;

  const next = await agent.resume({
    workflow: parentWorkflow,
    resume: result.resume,
    responses: [
      {
        interruptId: selectedQuestion.id,
        response: { type: "select", ids: ["approve"] },
      },
    ],
  });
}
```

`interrupts` becomes the authoritative collection on a suspended result. Preserve
`interrupt` as the explicitly designated primary question for compatibility.
Existing `response` answers that primary question; new `responses` may answer one
or several by ID. The two fields are mutually exclusive. `response: { type:
"cancel" }` remains whole-execution cancellation; exclude cancel entries from the
batch form. A domain choice called "reject" or "cancel" is still an ordinary answer.

The root handle covers one immutable suspension revision, including all children.
Partial resume returns a fresh root handle if work remains waiting. Unanswered
questions keep their IDs and snapshots, but stale root tokens cannot execute again.
Never let applications dispatch to child paths or manufacture child resume handles.

Validate every submitted answer before taking the token; an unknown/duplicate ID,
wrong choice or malformed answer consumes nothing. Atomic root-token claim permits
one runner for this snapshot. Competing answers using the same revision receive a
specific stale/in-progress command error; they must reload authorized pending state
and resubmit unanswered questions. Simultaneous external submissions are not silently
merged. Discovery indexes must expose the current root handle for all remaining
questions and must never make a half-written snapshot resumable.

This preserves simultaneous waiting children without requiring a distributed inbox.
Unattended processing and transparent retry of concurrent approval submissions would
need additional coordination and are outside this feature.

## Runtime semantics

### One child coordinator per node activation

Replace the active-call boolean with a transient coordinator plus a serialized
child ledger. The ledger records stable identity, manifest membership, input/version
fingerprint, status, cached outcome/error, checkpoint, pending questions and accounted
usage. Promises, controllers, engine callbacks and semaphores remain transient.

Register each call synchronously before its first asynchronous dispatch. Eager calls
are already registered when the helper receives them; it joins existing work. Lazy
groups register queue slots before invoking factories. Track running children through the node
boundary even when `Promise.all` rejects early. Observe every rejection. A node must
not commit, retry, clear call caches or finish its stream while owned children can
still mutate its state. Late calls into a closed activation fail explicitly.

Use lifecycle states such as queued, running, waiting, completed, failed and
cancelled. Persist queue membership as well as waiting snapshots; never serialize
"running" as if a live promise could be reconstructed after process restart.

### Suspension is a barrier for the current admitted group

Recommended first implementation: let the already-registered independent group
drain to completed, failed or waiting children. A waiting child releases its group
slot, allowing other already-registered members to reach their own outcome. Then
freeze the complete ledger, persist it, and expose the root suspension. The group
never returns a partial result into normal parent code.

This means an approval is not resumable while its sibling is still running in the
same suspension attempt. A slow sibling delays the suspension result. This is an
explicit tradeoff that avoids a new background scheduler or capturing live JS.
Root cancellation remains cooperative; node/I/O timeouts should be configured by
the application. Later low-latency pausing at safe graph boundaries can be evaluated
separately, without pretending arbitrary code can be frozen.

Reject new sibling groups/dependent work once a suspension has latched. Existing
admitted children retain permission to finish their own work and nested calls under
the inherited execution control. For raw promises, the node registry is the fallback
ownership boundary; the structured helper makes group membership explicit.

Route answers by durable invocation + interrupt identity. Use a coordinator-owned
bridge to the parent engine, not one parent positional interrupt per racing child.
Preserve local interrupt order inside each child. Isolate legacy sequential records
with a versioned decoder so already-issued suspensions remain resumable.

Mixed outcomes are preserved: completed results are reused, terminal failures remain
available for reconciliation, unanswered children remain waiting, and answered
children resume. A process restart after a sealed Redis suspension restores this
whole set. Arbitrary mid-node crashes retain the existing checkpoint/idempotency
limitations; no exactly-once external-effects guarantee is added.

### Limits and cancellation

Keep one shared `ExecutionBudget` object and signal per root attempt, inherited by
children. Synchronous check-and-increment already provides atomic admission within
one JS owner; this feature does not need a Redis counter per child operation.
Atomic resume ownership prevents separate processes from spending the same saved
allowance concurrently. Custom stores without atomic claiming cannot claim this
multi-process guarantee.

Concurrency width and total allowance are different: admitting up to four children
at once does not grant four independent model/tool/node budgets. Preserve reserve
before dispatch, charge failed attempts, and do not charge cached child work again.
Nested coordinators must not deadlock on a global slot held by their waiting parent;
the proposed width is local to the direct group, not a global child semaphore.

On exhaustion, stop new admissions/reservations across the root. Drain already
dispatched I/O, retain its known usage and checkpoint progress, and record queued
children that never started. Audit the existing post-node budget assertion: it must
not discard an otherwise completed sibling merely because another sibling blocked
the budget. Persist one root limit gate and one shared counter snapshot. Preserve
pending human questions underneath that gate. Answering a human question does not
reset allowance; Continue must explicitly open the next allowance before blocked
work is dispatched. Keep existing server-approved ceilings/overrides.

Root abort stops queued work, signals every running descendant and prevents another
wave. Wait for cooperative child cleanup before claiming terminal completion. Do not
report an uncooperative external operation as physically stopped. A retry must not
overlap a previous attempt's still-running children. Cancellation never rolls back
already-committed business effects.

Aggregate usage by per-invocation deltas, including partial known usage from failed
or cancelled attempts. Restored totals and cached results are historical evidence,
not new charges. Across parallel graph nodes, merging copied cumulative totals would
lose or duplicate usage; use one owner/ledger and project totals from it.

### Parallel graph edges require additional work

Before removing `assertSequentialWorkflow`, fix and prove:

1. Store hook/reason/child state by engine task/node activation, including loop
   generation, rather than one shared node-state envelope. Preserve task pending
   writes in snapshots and tombstone only the completed activation's records.
2. Merge node output deltas at a defined join boundary. Do not deep-merge full stale
   input snapshots from each branch. Disjoint fields can merge; overlapping writes
   need an explicit deterministic policy or a useful conflict error. Apply equivalent
   rules to workflow state, routing fields, history and UI state.
3. Define joins for unequal-length paths. Multiple incoming plain edges are not a
   substitute for an explicit all-predecessors barrier. The current public edge
   schema cannot express an array-source LangGraph join; decide its representation
   before advertising arbitrary DAG joins. Wolly's group call already supplies a
   join and does not need that graph API expansion to retain its own waves.
4. Collect all graph interrupts and route an ID-keyed resume map into the engine,
   including parent parallel nodes, parallel nodes inside a child and nested children.
5. Rebind transient services consistently on restoration and preserve root contracts,
   child graph isolation, root-only handoffs and `completeResponse` ordering.

Do not silently resolve conflicting graph outputs by last arrival. Keep the current
guard until these cases pass; clearly document partial support if hook concurrency
is delivered before parallel graph composition.

### Persistence and Studio

Use one versioned root suspension bundle as the authoritative state, with child
checkpoints and all waiting questions. Seal it before publishing a usable token;
secondary question/discovery records are indexes, not independent executable copies.
Make publishing/replacing indexes recoverable from that root bundle. Test persistence
failure between claim, snapshot save, index replacement and response publication.
Do not restore a consumed handle after user code has begun merely because a later
write failed: that could repeat external effects. Broader crash recovery is separate.

Fork/rollback copies the complete bundle and rebases branch identity/tokens while
preserving logical call identity within the branch. Keep the existing legacy decoder;
never reinterpret positional answers as IDs without a record-version check.

Studio should retain `(runId, branchId, invocationId)` and the correct child workflow
revision. Add group/key metadata only for display, not as a synthetic workflow.
Represent queued, waiting, resumed, completed, failed, cancelled and reused/restored
children accurately. A parent may be waiting on several leaves; replace singular-leaf
assumptions in projections. Concurrency permits overlapping durations; do not sum
child wall times and present that as parent elapsed time. Preserve stream IDs and
show cached/restored work without generating new model-cost rows. Keep tokens and
checkpoint contents out of telemetry. Keep CLI discovery working through array calls
and factory wrappers.

## Delivery sequence and release gates

1. **Coordinator and replay ledger:** internal integration tests for concurrent
   starts, stable identities, terminal outcome collection, ownership on early
   rejection, nested groups, and cache cleanup. Public guard stays until safe paths
   are complete.
2. **Durable group suspension:** one/multiple human pauses, keyed responses, partial
   resume, legacy compatibility and real Redis reconstruction. Update execute,
   resume, chat/SSE and discovery together.
3. **Control and observation:** all four shared limits, mixed limit/human pauses,
   cancellation and usage; Studio correlation/restoration; fork/rollback and claim
   races. Ship the hook capability and helper only when these gates pass.
4. **Graph composition:** activation-indexed state, deterministic merges, explicit
   joins and graph-level multiple interrupts. Remove topology guards only after its
   separate regression matrix passes.
5. **Consumer parity:** replace the Wolly blocker expectation with positive SINGLE,
   SERIAL, PARALLEL and MIXED tests. Run the existing orchestration, goal action,
   memory, delivery and evaluation corpus before cutover. Framework support alone
   does not prove migration completeness.

Use deterministic deferred gates, not timing thresholds, to prove two children have
started before either completes. Cover reverse completion order, unequal graph paths,
duplicate IDs, changed manifests/versions, retries after caught failures, simultaneous
and sequential approvals, completed/failed/waiting mixtures, invalid/duplicate/stale
answers, cancellation during dispatch and saving, and exact remaining allowance
under concurrent reservations. Compare actual model/tool/effect counters before and
after Redis reconstruction; a passing suite that skipped Redis is insufficient.

Type tests must prove heterogeneously inferred tuple outputs and transformed inputs,
reject wrong calls and unchecked result access, and retain honest types for
dynamic workflow IDs. Run existing sequential child, execution/limits, checkpoint,
chat, Canvas and Studio suites as regressions when implementing.

## External references

Temporal documents concurrent `executeChild` calls using `Promise.all`, supporting
the familiar array-of-child-calls shape: [TypeScript child workflows](https://docs.temporal.io/develop/typescript/workflows/child-workflows).

LangGraph documents resuming several parallel interrupts with a map from interrupt
ID to answer. Use that capability beneath Kortyx's root-handle contract where it
fits; verify against the pinned `@langchain/langgraph@1.2.5` before implementation:
[Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts).
