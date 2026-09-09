# Studio support for child workflows

Status: Approved and implemented. Runs defaults to root executions, with an optional **Include child workflows** toggle. The execution tree, lifecycle and result inspector, interrupt ancestry, branch histories, and observed-call overlay are implemented. Observed calls are visible by default and can be hidden with the toggle. Generic traces remain available for older telemetry.

Related: [SDK child workflow contract](./child-workflows.md), [Observe detail views](./observe-detail-views.md).

## Recommended experience

Keep a child invocation inside its parent run. In the run trace, render it as a collapsible call under the node that called it, with its own nodes, human waits, result, and execution attempts. Let the user follow the chain from a waiting leaf back to the parent, and see exactly where execution returned.

The workflow catalog stays a view of declared definitions. Add an optional overlay of calls actually observed in the selected time range. A call has different semantics from a `transitionTo` handoff: it returns to the calling node. Neither view requires users to declare calls in their workflows.

Studio remains an observer. It does not execute a child independently, answer an interrupt, or roll back an application database.

## Example run view

A creation call waiting for the second picker would look like this:

```text
Run · general-chat                                  Waiting for human input
└─ chat                                              Waiting on child
   └─ Call canvas-creation · create-canvas             Waiting for human input
      ├─ select-brief                                Completed
      ├─ select-facilitator                          Waiting for human input
      │  └─ Which facilitator?                       Waiting · 2m 14s
      └─ Return to general-chat / chat               Pending
```

After the answer, the same logical call expands to show resumed execution and its return. Previously completed nodes remain visible once; the currently interrupted node can show multiple attempts. The pending return is a UI placeholder, not a synthetic telemetry fact.

```text
Run · general-chat                                  Completed
└─ chat                                              Completed
   └─ Call canvas-creation · create-canvas             Returned
      ├─ select-brief                                Completed
      ├─ select-facilitator                          Completed · 2 attempts
      ├─ generate-canvas                             Completed
      ├─ respond                                    Completed
      └─ Returned to general-chat / chat              View result
```

Expanding the call shows attempts and the real human wait. A later parent replay can say “Reused saved result” without drawing another execution of `generate-canvas`. Repeated calls to the same workflow with different invocation identities get separate rows. Recursive/nested calls continue the tree at the correct depth.

### Run list and overview

- Keep one row per root run. Add “3 child calls” and the deepest waiting workflow/node to the overview; use the existing run detail to inspect them.
- Do not turn child workflows into independent root runs or append them to the linear handoff path as if they replaced the parent.
- Count model generations once across the entire run. Offer per-call totals in the inspector, without adding those subtotals to the root total again.
- A failed child can be handled by its parent. The root may succeed while the child row remains failed. Waiting for a child is distinct from the child waiting for a person.
- When telemetry is incomplete, label the outcome unknown/incomplete. A generic span ending is not proof that a child returned.

### Child inspector

Reuse the existing detail inspector and drawer/full-page behavior. A selected call shows:

| Area | Contents |
| --- | --- |
| Identity | Child workflow/version, calling workflow/node, call ID, invocation ID, branch, parent call link |
| State | Running, waiting for human input, waiting on nested child, returned, failed, cancelled, or incomplete |
| Data | Validated child input and returned `data`, only when captured under the application's content policy |
| Timing | Active execution, human wait, and total elapsed time, with clear inclusive/exclusive labels |
| Attempts | Initial execution, resume attempts, saved-result reuse, and errors |
| Navigation | Workflow definition, originating interrupt, parent call, source fork/checkpoint, raw events |

“No input/output captured” is an explicit empty state. Never display internal graph snapshots, hook records, runtime config, credentials, or resume tokens as child business input/output. Enforce payload size limits and truncation metadata. Content capture must stay opt-in.

Deep links extend the run selection, for example `/runs/<runId>?call=<invocationId>&branch=<branchId>`. Existing trace-event links remain valid. Browser Back, refresh, and opening in a new tab preserve selection; a missing call shows an explanation instead of selecting a different call.

### Interrupts

The interrupted leaf owns the human request. The root and enclosing calls show that they are waiting on that leaf. The interrupt detail shows a breadcrumb such as:

`general-chat / chat → canvas-creation / select-facilitator → human request`

Keep the root routing identity separate from the leaf's origin identity. Today the child request is bridged through the parent, so its public routing fields alone cannot identify the original leaf. Link from the interrupt to the exact call and vice versa. Resolution updates the existing call; it does not create another logical invocation.

Protocol cancellation ends the waiting execution and propagates a derived cancelled status to waiting calls. An application choice labelled “Cancel” is a normal response and can produce a successful child result. Do not conflate them. An expired token ends the current ability to answer that token; do not claim the application performed a cancellation or undo.

### Fork and rollback

A fork shows “Forked from run X at checkpoint Y” and its own call tree. Before the fork point, display restored history as inherited evidence; do not imply the fork performed those model calls or writes again. Link to source history when the fork's telemetry does not contain it. After the fork, answers, results, status, and metrics are branch-local.

Rollback preserves historical events but marks the discarded continuation superseded. A branch selector lets the user inspect it. The default view follows the active continuation. A pre-rollback completion event must not make the restored waiting child appear complete.

Source and fork may contain the same saved `invocationId`. The UI and projections must not merge them. Likewise, rollback may restore a call under the same `runId`; run ID plus invocation ID alone is insufficient to distinguish the new continuation.

### Workflow catalog and canvas

Keep declared internal edges and handoffs as they are. Add an “Observed calls” toggle, enabled by default, beside existing view controls; show call relationships only for the selected environment/time range and revision filters.

- Draw a distinct, labelled “calls · returns” connector from the calling node to the child's workflow container. Use line style, arrow treatment, and text, not color alone.
- Aggregate by calling workflow revision, node, call ID, and target workflow revision. Repeated invocations affect volume without generating duplicate connectors.
- Clicking the connector shows call count, outcomes, active/wait timing, and links to representative runs.
- No observed calls means “No calls observed in this range,” not “This workflow cannot call children.”
- Unregistered/missing historical revisions appear as unresolved workflow references. Do not attach old calls to a convenient latest revision.
- Do not add an artificial reverse topology edge to represent each return. Return belongs in the run story; the connector's label explains its semantics in the catalog.

## What the current code supports and where it falls short

These findings come from the repository, rather than an assumed Studio model:

| Existing code | Consequence for this proposal |
| --- | --- |
| `packages/runtime/src/graph/call-workflow.ts` emits `kortyx.workflow.call` spans with call/invocation IDs | Useful starting correlation, but spans represent service attempts, not the whole logical lifetime across pauses |
| `packages/hooks/src/workflow.ts` caches results and contains child snapshots | Cache reuse does not invoke the service, so the existing span cannot describe it; this hook knows when a saved result is reused |
| `apps/studio/src/features/runs/lib/run-trace-story.ts` uses fixed node/generation depths and chronological phase grouping | Child operations currently appear as generic spans; nesting needs explicit ownership and span ancestry |
| `packages/telemetry-db/src/repositories/studio-read-models.ts` groups workflow executions by run/workflow/revision | Repeated calls to the same child can be collapsed; child success also needs an explicit call terminal instead of a root-run span |
| `apps/studio/src/features/workflows/lib/workflow-graph.ts` and workflow schemas model transitions | Calls need a separate relationship collection with return semantics |
| `packages/telemetry/src/event-mapper.ts` falls back to active parent revision/hash/node fields | Clearing fields in the child runtime config alone does not prevent parent identity leakage; correlation must respect workflow boundaries |
| Current child interrupts are forwarded as parent requests | The original leaf identity and complete call chain need structured telemetry metadata |
| Snapshot-backed forks allocate a new run ID; rollback restores a saved state | Fork lineage and rollback continuation identity must be explicit, not inferred from timestamps or invocation IDs |

The SDK execution feature can ship separately. Full Studio support requires instrumentation and read-model work; it is not just a new icon or indentation rule.

## Proposed telemetry contract

Use existing generic spans for timing and diagnostics, and add explicit child lifecycle facts for logical state. Publish an additive, versioned telemetry contract before building the UI. Older SDK events must remain accepted.

### Identity

| Field | Meaning |
| --- | --- |
| `runId` | Existing root execution identity; children do not get independent run IDs |
| `branchId` | Persisted continuation identity; stable across resume, new on fork or rollback |
| `invocationId` | Runtime call identity, already persisted by the hook; stable across pause/resume |
| `parentInvocationId` | Enclosing child call, or null for a root node's call |
| `callerNodeExecutionId` | Persisted logical activation of the caller node; distinguishes graph-loop re-entry from replay |
| `callId` | Developer's stable hook ID, for display and call-site grouping |
| Caller/child workflow IDs and revisions | Explicit source/target identity, including calling node and target declared version |
| `attemptId` / span references | A concrete execution or resume segment within the logical invocation |
| `sequence` | Monotonic logical ordering within one branch/call, retained with checkpoint state |

A call is keyed by `(project, environment, runId, branchId, invocationId)`. `eventId` deduplicates delivery; sequence orders lifecycle changes when events arrive late. Spans use `(traceId, spanId)` ancestry for execution segments. Do not infer logical ownership solely from timestamps or node names.

The implementation must verify that snapshot/restore preserves these identities and sequence values. On a new branch, sequence/state must be initialized from the restored record under the new branch identity. Event emission belongs at hook/service state changes, not UI guesses. A runtime crash between checkpoint and telemetry delivery can still produce missing facts; Studio reports missing evidence rather than promising an atomic telemetry transaction.

### Lifecycle facts

Proposed event names (not current SDK exports):

| Fact | When it is emitted |
| --- | --- |
| `workflow.call.started` | A new logical call is created |
| `workflow.call.suspended` | The child returns an interrupt checkpoint, with the originating workflow/node, interrupt ID, and enclosing call chain |
| `workflow.call.resumed` | A saved waiting call begins another execution segment |
| `workflow.call.completed` | Validated output is committed to the hook's result record |
| `workflow.call.failed` | The child outcome is recorded as failed |
| `workflow.call.reused` | Parent replay reads a previously completed/failed call record without executing the child |
| `workflow.call.restored` | A fork/rollback restores a call record, with saved state and source lineage |

A service span that ends with `status: interrupted` remains an execution segment; it must not produce a logical completed event. Returning a completed result from the cache produces reuse, not another completion. Waiting ancestors can derive “Waiting on child” from the suspended leaf; deduplicate the root human request by interrupt ID.

Add branch-lineage facts at actual fork/rollback operations, including source session/run/branch/checkpoint and the new branch. Initial restored call facts are needed even when the original start occurred before available telemetry. Capture only call metadata and state at restore, not full checkpoint blobs. Cancellation is derived from explicit root cancellation/interrupt facts; do not invent child execution that did not occur.

Attach child revision identity from its own registered definition. The event mapper should inherit revision/hash/node only within the same workflow context; crossing into a child with unknown revision means null/unresolved. Publish child definitions through the existing catalog registration path, independently of call events.

### Content and metrics

Emit validated business input/output only under the existing input/output capture policy. Preserve schema/version metadata without claiming arbitrary Zod refinements and transforms are losslessly representable as JSON Schema.

Root totals use unique generation facts. Child totals aggregate owned descendant generation facts once; exclusive totals omit nested children. Reuse and restored-history records add zero new model usage or execution time. Inherited source work can be shown separately when source facts are accessible. Waiting spans contribute to elapsed/wait time, not active execution latency. Failed children remain failures even if a parent recovers; child success rate must not simply copy the root status.

## API and storage approach

Extend telemetry enums and payload validation in the hooks/telemetry/contracts packages, then build a deterministic call projection from stored events in `packages/telemetry-db`. Return additive `workflowCalls` and branch-lineage data in the run detail API, and a separate observed-call collection in the workflow system API. Preserve legacy `transitions` and existing run detail consumers.

Use the existing project/environment authorization and pagination. Do not require runtime-store access from Studio: telemetry storage is the source of observation. Start with event-derived projections using the existing projection infrastructure; introduce additional persisted tables/indexes only if measured query cost requires them. A contract change may still require a projection version/backfill and must include a migration plan.

For partial histories, missing parents, mixed SDK versions, and unresolved revisions, retain raw events and render explicit incomplete entries. Old generic call spans may be shown as “Child call · outcome not captured”; they cannot be backfilled into reliable lifecycle facts. Paginated history must indicate unloaded descendants instead of counting them as zero.

## Delivery order after approval

1. **Telemetry and projection foundation.** Add identity/lifecycle/lineage facts, enforce child revision boundaries, and validate with real nested interrupt/fork fixtures. No UI claims before these facts are dependable.
2. **Run and interrupt experience.** Add the collapsible call tree, logical status, captured result inspector, ancestry breadcrumbs, deep links, and branch selection. Preserve existing drawer behavior and generic trace/raw event views.
3. **Observed catalog relationships.** Add the optional call overlay and call metrics with links to runs. Keep declared graphs unchanged.

The first two steps form the minimum useful Studio support. The overlay can follow without blocking inspection of real child calls. No SDK workflow declarations, visual call editor, standalone child execution, or automatic external-effect undo are proposed.

## Acceptance criteria

- A parent calls a child and continues: one root row, one child call, correct return result, later parent work visible.
- Two call sites target the same child: separate invocations and correct call-site metrics.
- The same node loops: new activation/call rows; replay of one activation remains the same call.
- A child interrupts twice, then the parent interrupts: requests attach to the right owner and resumed attempts remain under their logical call.
- A grandchild waits: every ancestor shows the correct dependency and the leaf request is displayed once.
- Parent retry reuses a completed child: no duplicate child completion, generation count, token cost, or active duration.
- A child fails and the parent handles it: failed child and successful root are both visible.
- Fork at a pause, then answer source and fork differently: independent trees/results with linked lineage and clear inherited history.
- Roll back after completion and answer differently: active branch returns to waiting/resume, old completion remains historical rather than winning the status reducer.
- Server restart during a pause: logical identities survive; new trace segments do not invent new calls.
- Duplicate/out-of-order events, missing starts/parents, truncated payloads, expired tokens, and old SDK spans produce honest, deterministic states.
- Child spans never borrow a different workflow's revision/hash. Uncaptured data and internal snapshots never appear as business results.
- Browser checks cover run/interrupt navigation, call selection after refresh/Back, narrow drawer layout, accessible expand/collapse, and the optional call overlay using real Canvas traffic.

The user approved this experience, including searchable child rows behind the Include child workflows toggle. Implementation uses additive event contracts and existing projection tables. Existing events can be reprojected with `pnpm db:backfill-studio`; generic pre-lifecycle spans cannot be upgraded into missing logical facts.

## Catalog regression correction

Migrating Canvas from `transitionTo` to `useWorkflow` exposed that the original projector only discovered handoffs. The CLI now follows source-level workflow references and calls through local custom hooks, publishing supplemental call metadata on the existing topology revision. Runtime registration preserves it; an explicit CLI republish replaces it. The executable hash remains stable between CLI and runtime.

Studio shows source-discovered call/return paths before traffic, distinguishes calls from handoffs, and overlays observed metrics without duplicate edges. Dynamic or unavailable source targets produce CLI warnings. Regression coverage includes all four general-chat calls and update-canvas's save fallback with no executions, custom-hook/alias resolution, catalog preservation across runtime registration, and overlay deduplication.
