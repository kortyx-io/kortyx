# Direct tool execution observability: implementation and investigation

Status: implemented and verified locally; not released. The investigation below
records the original API assessment and proposals before implementation.
Investigated on 2026-09-17 against Kortyx checkout `a4575ae132711cdda7f880022b929cd6eb3e148c` **plus the existing working-tree changes**. The probes resolve SDK, contracts, API, database repositories and Studio to their current source files rather than stale package builds.

Extended on 2026-09-18 with the [cross-library lifecycle audit](../audits/tool-lifecycle-crosscheck-2026-09-18.md): Vercel AI SDK, LangChain/LangGraph, OpenAI Agents JS and Mastra. It confirms additional observer isolation, result identity, resource cleanup and metadata privacy gaps; the shared native primitive should address these before exposing a second execution path. Advertised tool schemas are not locally enforced today, which requires an explicit contract decision rather than an incidental observability change.

## Implementation status, 2026-09-18

Implemented the accepted `useTool({tool, input, id?, abortSignal?})` API and shared
native lifecycle, source-only CLI discovery, safe tool contracts/ingestion, workflow
capabilities and metrics, run filters and trace/event outcomes. The investigation
sections below describe the **pre-implementation baseline**. The supported API and
ownership/replay/privacy contracts are documented in
[the tool guide](../../skills/kortyx/references/hooks-use-tool.md).

Verification includes the real SDK → authenticated Hono telemetry API → disposable
PostgreSQL → Studio trace/React rendering; concurrent child denials in successful
workflows; native approval/cancellation/result identity and observer failures;
partial/whole cache reuse, child restoration, resume/forks/rollback; source discovery through
imports, helper hooks and bound factories; and a hydrated browser journey through
workflow tool search, capability inspection, cohort-preserving denial links, and
run trace/code inspection. Test fixtures run in disposable installations and are
not presented as application traffic. Existing checkpoints without tool summaries
remain usable but cannot reconstruct historical observations.

Release the API/Studio contracts before the new SDK: older APIs reject unknown
facts in an entire batch. Execution remains unaffected by delivery failure. Direct
calls intentionally do not cache operations or introduce permission policy.

## Original investigation and decision

Existing public tracing APIs support a correlated **generic operation span** around direct execution. They do not provide the requested first-class tool behavior through Studio. Recommend a server-side `useTool(...)` hook for explicitly enrolling a direct invocation in Kortyx's tool execution boundary, backed by the same execution primitive used by native `useReason({ tools })` dispatch. `useTool` is a proposed name; it does not exist in the current public exports.

No MCP transport, provider invocation, schema conversion or framework dependency belongs in the shared tool factories. The Kortyx integration calls their existing execution functions. Studio remains an observer; application code continues to enforce permission and decide what to do with a denial.

### Architecture reconsideration, 2026-09-18

The reason to introduce the hook is to make an existing named tool capability participate in the same runtime execution contract regardless of whether a model or deterministic node chooses to invoke it. Native tool dispatch already consumes `maxToolCalls`, propagates the effective cancellation signal and checkpoints results. Plain direct calls bypass those responsibilities as well as tool telemetry. A small supported execution primitive makes this enrollment explicit.

There are three legitimate scopes:

| Option | Appropriate when | Consequence for this request |
| --- | --- | --- |
| Keep application wrappers and generic spans | The calls are ordinary application services and only span visibility is needed. | Smallest scope, but does not satisfy first-class Studio tool records or shared runtime tool budgets. |
| Fix native `useReason` telemetry only | Only model-dispatched calls need tool lifecycle semantics. | Necessary correctness work, but direct invocations remain outside that contract. |
| Add `useTool` using the native execution primitive | Both deterministic and model-driven invocations of a capability should be Kortyx tool operations. | Fits the original requirements while keeping business policy in the application. |

Recommendation: add the narrow execution hook if retaining the original requirements. Ordinary service functions remain callable without it; Kortyx must not automatically discover or instrument arbitrary application I/O. `useReason` chooses calls through a model, while `useTool` lets node code choose a call directly. Neither mechanism owns the underlying application's permissions.

For an initial release, expose direct execution, signal propagation, one shared-budget charge per actual invocation, runtime-owned identity/timing, outcome annotations and adapter delivery. Keep direct replay behavior as explicit execution; preserve native checkpoint reuse and make that reuse visible. The `replay: "reuse"` direct caching extension discussed below is a follow-on proposal, not a prerequisite for the initial hook. Approval orchestration, automatic retries, arbitrary result persistence, idempotency guarantees, tool registries and new transports are outside the initial API. Observation metadata/classifiers can live in a shared integration policy used by both paths; business factories need no dependency on Kortyx.

An application-declared denial is descriptive telemetry. Without a classifier, a normally returned `{ status: "DENIED" }` remains a successful execution whose business meaning Kortyx does not infer. With a safe classifier it can be displayed as Denied without altering the returned value or workflow completion. Authentication, permissions, recovery and authorization of reused data remain application-owned.

The hook must work when Studio and telemetry are entirely disabled. If it only emitted span decorations and never participated in the execution boundary, a general tracing wrapper would be a better abstraction than a new tool hook. The shared execution primitive and native lifecycle fixes should therefore be designed before committing to the public signature.

## Reference and public API assessment

An existing consumer integration was inspected, including its shared tool caller and a direct workflow-node invocation.

`currentJobTools()` binds the shared factories to request-local identity/API credentials and exposes `search` and `knowledge` through a twelve-call budget wrapper. Its audit callback records `{ tool, status }`; it does not report Kortyx tool facts or duration/correlation. The Brief node calls `tools.knowledge(...)` directly, then exposes the same implementation to native reasoning through a `KortyxExecutableTool`. A returned `{ status: "DENIED", reasonCode }` is an expected application result. The adapter also has an `OUTSIDE_SELECTED_JOB` denial before invoking the shared caller, so instrumentation confined to `currentJobTools().knowledge` would miss that denial. Binding failures converted to `null` are caller setup denials, not executed tool calls.

| Public surface | What works today | Why it is insufficient |
| --- | --- | --- |
| `telemetry.trace.startSpan(...)` / optional `withSpan(...)` | Names, span duration, arbitrary attributes, thrown failure; built-in Studio adapter inherits active node/child/run correlation. | A direct operation is a generic span; denial attributes do not set Studio tool outcome. `startSpan` alone does not make its span active for nested operations. |
| `span.addEvent(...)` | OTel exports generic events. Studio adapter maps three legacy `useReason.tool-call.*` names to tool facts. | Studio ignores an arbitrary `tool.started` event name. Using `useReason` event strings for direct work couples the app to a native reasoning implementation and still lacks denial/cancellation/replay semantics. |
| `telemetry.reporter.emit(...)` | Public typed wire-event transport; existing tool events can carry arbitrary payload attributes. | App must build logical correlation, IDs, timing, classifications, replay bookkeeping and deduplication itself. It is transport access, not an execution API. |
| `trace.getActiveContext()` | Current physical trace ID and span ID. | Does not expose run, workflow revision, child invocation, branch or node. The original adapter object is not a public getter for the runtime's scoped correlation. |
| `@kortyx/otel` | Backend-neutral generic spans around arbitrary direct callbacks. | Its output is OTel; the current Studio API ingests Kortyx wire events, not an OTLP feed. OTel configuration alone does not make Studio tool records. |
| `useReason({ tools })` | Accepts local `KortyxExecutableTool.execute` callbacks; no MCP connection is required. | Requires model reasoning, and the native telemetry itself has the gaps below. It cannot be used as a deterministic execution workaround. |

Relevant source: [tracing types](../../packages/hooks/src/tracing.ts), [public exports](../../packages/kortyx/src/index.ts), [Studio trace adapter](../../packages/telemetry/src/trace.ts), [correlation mapper](../../packages/telemetry/src/event-mapper.ts), [OTel adapter](../../packages/otel/src/adapter.ts), [native tool loop](../../packages/hooks/src/reason/tools.ts).

## Verified behavior through the current stack

Reproduce with `bash scripts/probe-direct-tool-observability.sh` from an installed checkout with Docker running. The runner creates an ephemeral PostgreSQL 17 container on an automatically assigned loopback port, applies the real telemetry migrations, creates fixture project/API credentials, and removes the container on exit.

**23 characterization tests passed after the crosscheck extension:** thirteen exercise SDK workflows with the in-memory runtime, deliver the real adapter's batches through the actual authenticated Hono telemetry routes into PostgreSQL, read the actual Studio API responses, and run Studio's trace builder; ten cover native hook/checkpoint logic and standalone/offline observation. Three cases additionally render the real `RunTrace` React component to static HTML; only its browser URL-state hook is replaced. Providers are local stubs. This is source-level integration and server-render verification, not a deployed check, browser hydration check, or a live consumer permission/provider test. Fixture workflows are isolated research cases, not catalog traffic intended to make an application appear connected.

| Probe | Result |
| --- | --- |
| Unwrapped direct denied call | SDK and Studio run both **Completed**; no `tool.*` facts and no tool row. |
| Public generic direct span, including a denial code | Correct run/workflow/node/branch and numeric duration; rendered operation is a **completed generic span**, with no Denied tool state. Raw input/output markers are absent. |
| Manually use legacy reasoning event strings | API stores `outcome: denied` and `denialCode`; Studio tool row still says **completed**. An arbitrary `tool.started` span event is ignored. |
| Two native local callbacks, one denied and one successful | Each callback executes once with no MCP transport. Both emit `tool.completed`, the denial has `isError: false`, and neither terminal contains per-call duration or a denial code. Both tool starts share the `useReason` span. Studio labels both rows with the node ID and gives them the same duration. |
| Explicit native `isError: true` result, handled by model | SDK/root complete, but the tool emits `tool.completed` and Studio renders completed despite the explicit error flag. |
| Credential placed in request context with content capture disabled | Credential marker is transmitted as node metadata and stored in PostgreSQL; Studio redacts it only in its response. Credentials held solely in factory closures are outside this demonstrated path. |
| Native approval denial across resume | Workflow completes successfully without executing the tool. Two `tool.started` events are recorded, one before suspension and one on resume; no tool terminal is recorded. |
| Native ordinary fault | `tool.failed` is recorded; the model can recover and the overall workflow completes. Raw exception-message marker is absent. |
| Native active cancellation | Workflow becomes Cancelled, but the started tool has neither `tool.completed` nor `tool.failed`; there is no dedicated tool cancellation type. |
| Direct generic span inside a child, then resume and fork | Child/node/run ownership is inherited. Source resume preserves invocation identity; fork preserves that logical invocation under a different run/session/branch. The callback actually executes three times, each represented by a new span. Generic tracing does not provide replay caching. |
| Native completed reason checkpoint, then resume and fork | Tool executes once; both branches complete. Fork preserves logical child invocation and changes branch identity. Native cached results produce no explicit tool replay record; fork has no `tool.*` evidence for the reused call. |
| Manually instrument shared callback also used by native reasoning | One callback execution produces two tool starts, two tool terminals and two Studio tool rows. |
| Reporter puts invocation/branch only in correlation envelope | API accepts it, but ingestion drops those fields; Studio detail has neither. Built-in mapper works around this by copying them into payload. |
| Send `tool.denied`, `tool.cancelled`, `tool.reused` | Current API returns **400** for each proposed type. These are not existing APIs/contracts. |
| Telemetry transport rejects | Direct returned denial is unchanged; adapter `flush()` resolves despite failed delivery. |
| Direct span outside runtime without run/workflow | No Studio batch is produced. |

The rendering issue is concrete: [buildTraceStory](../../apps/studio/src/features/runs/lib/run-trace-story.ts) matches terminals by `spanId`, ignores tool outcome attributes, and falls back to `payload.name` or `nodeId` for labels. Native tools instead supply `payload.tool`, share one reasoning span and provide no individual duration. Tool terminals can therefore contaminate other tool/reasoning rows sharing that span; a fault can make an otherwise successful sibling tool look failed. Run completion is separately based on the latest root `kortyx.run` lifecycle, so a business denial must remain independent of workflow success.

The storage issue is in [ingestTelemetryEvents](../../packages/telemetry-db/src/repositories/telemetry-events.ts): it stores `payload` but has no dedicated invocation/parent-invocation/branch columns. Studio child ownership currently depends on payload copies. The supported implementation must normalize these fields at ingestion, rather than require consumers to know that convention.

## Proposed minimal supported API

The user accepted this invocation shape and initial scope on 2026-09-18. This is illustrative **future** code, not a current importable API:

```ts
const result = await useTool({
  tool: knowledgeTool,
  input: { jobId },
});

// The same shared definition can be selected by the model.
await useReason({ model, input: question, tools: [knowledgeTool] });
```

The hook executes immediately, initially inside workflow nodes. It does not return a callable function and does not automatically cache direct results. The shared definition holds the name/schema/execution adapter and optional safe outcome mapping once; ordinary call sites supply only the tool and input. Runtime correlation, call identity and telemetry delivery remain invisible to those call sites. Explicit IDs are an advanced option only if needed, not required ceremony. Keep the tool's original result and thrown error; permission denial remains an application result or exception.

Tool callbacks should receive the effective `AbortSignal` so integrations can forward it where their shared tool signature supports it. Bound request signals in consumer apps remain valid. Reporting a denial must never grant access, throw a replacement denial, retry a business operation or decide workflow recovery. The exact declaration spelling for shared classifiers/allowlisted denial codes remains to be designed; this does not require another product decision.

Only four terminal outcomes are supported: `success`, `denied`, `fault`, `cancelled`. Returned results default to success; known native `KortyxToolResult.isError` defaults to fault. Application classifiers can distinguish expected denial from either returned or thrown values. Kortyx must not infer denial from HTTP status, an arbitrary `status` field, error text or tool name. Interrupts and execution-budget suspension are control flow, not faults, business denial or cancellation.

Classifiers are synchronous, perform no telemetry I/O, and return only a small outcome descriptor. Denial codes must match a bounded identifier grammar such as `[A-Z][A-Z0-9_]{0,63}` **and** an explicit application allowlist. Syntax alone cannot establish that a string is safe. Invalid or unapproved codes become a generic `DENIED`, without exporting the rejected value. Classifier/reporting failure does not change the application result/error; use its default outcome and a local diagnostic counter.

The shared factories remain unaware of Kortyx. A consumer can construct a request-local shared tool definition around the same factory and permission checks, then use that definition through both direct and model-selected execution. Runtime-owned direct-call IDs avoid per-call ceremony; native model calls supply their provider call IDs through the dispatcher. The adapter's `OUTSIDE_SELECTED_JOB` check must be inside the observed native invocation. Caller-binding denial before a tool is selected is a separate application observation, not a fictitious tool execution.

## Proposed Studio and CLI product scope

The user requested attached-tool visibility in the Workflows route and CLI discovery, plus relevant Studio improvements. This section records the recommended product scope, not implemented UI or catalog contracts.

Show tools as capabilities attached to workflow nodes. A reasoning node can make a tool **Available to model**; a node containing a direct hook can **Call directly**. The same definition may appear in either or both roles and under several nodes. These are capability relationships, not control-flow edges or extra workflow steps. Start with node tool badges/counts and an inspector list; an optional canvas overlay can expand attachments when users want detail without making the default graph dense.

Clicking a tool opens its safe name/description, owning nodes, calling modes, a safe input-field/type summary and observed activity for the selected environment/version/time range. Do not export credentials, executable functions, schema examples/default values or request-local definitions wholesale. Attachments describe code capabilities; they do not assert that a particular user has permission to execute them.

Extend the existing `kortyx topology push` discovery path to find statically resolvable `useReason({ tools })` and proposed `useTool({ tool, input })` definitions through local imports/helpers. Do not require developers to duplicate their tool lists in workflow metadata. Discoverable attachments should appear before traffic; do not execute nodes, tool factories, MCP discovery or permission checks to find them. Entry-module initialization is already part of the CLI's current import path, so this is a guarantee about discovery work rather than a promise that arbitrary imported application modules are side-effect free.

Runtime-selected or request-dependent attachments may be unresolved statically. Report that limitation in CLI dry-run warnings and Studio's discovery status, then add real observed tools with explicit provenance. **Available**, **Observed**, and **Not statically resolved** must remain distinguishable; no execution history does not mean no attached tools, and one observed tool is not evidence of the complete available set. Runtime observations do not rewrite the declared catalog or imply access for all users.

Include these related Studio improvements with tool visibility:

- Search workflows/nodes by tool name and filter real calls by outcome and calling mode.
- Show success, business denial, fault and cancellation separately; a handled denial does not make workflow health red. Keep approval waiting and cached replay distinct from actual execution.
- Show actual call volume and execution duration, with replay counts separate so reuse cannot inflate usage or make tool latency artificially low.
- Provide tool-to-run/call navigation, preserving environment, revision, time cohort and selected branch/child ownership where applicable.
- Show catalog provenance/freshness and unresolved discovery so users can distinguish an unused capability from missing telemetry or incomplete catalog publication.

Keep unrelated Studio redesigns out of this feature. The acceptance check is that publishing a real catalog shows a resolvable tool before traffic, then a real denied call in an otherwise completed workflow updates the same tool's activity and links to its correctly owned run event without exposing content or credentials.

### One observer for both execution paths

Implement an internal `executeObservedTool` primitive. `useTool` obtains runtime correlation from hook context and delegates to it. The native dispatcher delegates to the same primitive instead of maintaining its own start/complete/error emitters. Do not implement the new API by generating `useReason.tool-call.*` strings.

When a native dispatcher invokes a shared callback that calls `useTool`, a transient async-local execution scope lets that hook adopt the dispatcher's call/attempt/span identity and register its classifier. Only the dispatcher owns the lifecycle; the adopted hook returns classification to that owner. Match the registered logical tool invocation, not merely “some tool scope is active.” A genuinely nested different tool remains a separate child observation, and concurrent siblings have independent scopes. No global suppression flag, function serialization or symbol property on user inputs is needed.

Timing starts immediately before actual invocation and ends when that invocation settles, using a monotonic clock. Approval wait, cache retrieval and model latency are separate. A pre-execution approval denial reports `denied`, `executed: false`, and execution duration zero; suspension/resume does not create duplicate actual starts. Admission denied by an execution limit records the limit/suspension without inventing a business denial. An admitted cancellation records one terminal cancellation and preserves the framework's cancellation control flow. Signals are cooperative: do not claim an unresponsive callback has stopped, or fabricate rollback of a side effect, simply because its signal became aborted.

### Identity, interrupt/resume and replay

Record runtime-owned `(runId, sessionId, workflowId, workflowRevisionId, nodeId, branchId, invocationId, parentInvocationId)` at the call site. Root invocation may be absent. The current hook bridge already contains scoped telemetry; generalize its workflow-specific internal naming instead of introducing an application-supplied correlation bag or leaking logical execution data into credential context.

Each logical tool call has a stable ID scoped to node activation and child invocation. A separate generated `attemptId` and unique span distinguish actual executions and retries. Re-entering a node, revisiting it in a loop and retrying an attempt must not collide. Hook state should persist the node-activation/call identity needed for resume. On a fork, retained logical IDs belong to the new run/branch; historical execution evidence remains under the source branch.

Default direct behavior is `replay: "execute"`: re-execution gets a new attempt and new duration. This matches permission-sensitive application calls. An explicit `replay: "reuse"` can use existing node checkpoint machinery for completed results, guarded by logical call identity, workflow revision and locally checked input/cache identity; input fingerprints are not exported. Cache policy is application-owned and is not an authorization shortcut. Do not silently cache factory calls or promise exactly-once effects across process failure.

Native checkpoint replay must report `tool.reused` for previously completed calls, both when the whole reason result is cached and when the loop skips a completed result. It should also account for tools in a wholly reused/restored child: link to source tool evidence or project it under that reused child, since its node hooks will not execute again. Reuse references source `(runId, branchId, invocationId, toolCallId, attemptId)` and the recorded outcome/code. It has `executed: false`; it contributes neither an execution count nor execution latency. Display original execution latency separately from replay/retrieval time. Replayed clients or HTTP batch retries must not create fresh execution events.

### Wire contract, adapters and Studio

Keep the existing telemetry envelope and routes. Add supported `tool.denied`, `tool.cancelled`, `tool.reused` types alongside `tool.started`, `tool.completed` and `tool.failed`. Add a versioned typed payload for tool facts: safe name, logical call ID, attempt ID, monotonic `durationMs`, outcome, `executed`, optional allowlisted denial code, and source-reference fields for reuse. Generic `Record<string, unknown>` acceptance alone is not the contract. Legacy payloads must remain readable, without inventing outcome certainty where the old SDK omitted evidence.

Both adapters consume the same observation: the Studio adapter emits canonical facts, and the OTel adapter emits a tool span with the same outcome, duration, IDs and safe code. Keep denial distinct from infrastructure error; OTel error status belongs to faults, while cancellation has an explicit outcome. Preserve a unique tool span and correct parent node/reason/child span. If span facts and tool facts describe the same operation, Studio coalesces them into one tool row. Remove native legacy emission when switching to this observer so the Studio adapter cannot emit duplicates from both routes.

For tool facts, normalize validated invocation/parent-invocation/branch correlation into the currently stored payload, with envelope values authoritative; reject inconsistent supplied ownership rather than let a tool payload silently claim another child. This avoids an initial database migration. Do not apply that rewrite indiscriminately to `workflow.call.*`: their payload identifies the target child while their envelope may identify the caller. Expose tool ownership consistently in Studio's read contract. Transport retries retain the same `eventId`; the database already treats duplicate IDs as no-ops. Logical call/attempt IDs solve a different problem: correlating lifecycle and replay.

Studio should pair tool lifecycles by scoped call/attempt identity, with unique tool spans as supporting evidence, not by the shared parent reasoning span. Render safe tool name, duration and **Succeeded / Denied / Fault / Cancelled**; render **Replayed** separately with source outcome/evidence. Denied approval is distinguishable from actual execution. A terminal denial or pre-dispatch cancellation with `executed: false` must render without requiring an actual-execution start. Missing delivery evidence must remain incomplete rather than be treated as success. Add Denied/Replayed display states to trace and event stories, colors/labels, inspector and any tool filters; keep root workflow status determined by root execution completion. A caught fault likewise does not automatically make a successfully recovered workflow failed.

Default telemetry includes identity, safe name/code, outcome, timing and automatic fault type/message. Error messages are exported verbatim (bounded), so sensitive text embedded in a message requires an optional application override. Do not send factory definitions, credentials, headers, closure state, runtime/checkpoint snapshots, raw arguments/results, exception objects, causes or stacks; fault type/message are automatically exported, with an optional application projection/suppression override. Existing content capture is off by default but metadata/attributes are exported independently, and node runtime code copies request context into telemetry metadata. Therefore this wrapper must not spread tool args, identity or caller context into metadata. Arbitrary user metadata is not a credential firewall. Any future content opt-in needs explicit safe projection and credential redaction before enqueueing; Studio's key-name redaction happens after storage and cannot prevent export.

All span operations, classification, reporter calls and serialization must fail independently of execution. Execute the business callback once, outside a telemetry catch that could rerun it. Preserve the original error if reporting its terminal fails. Enqueue asynchronously into the existing bounded, best-effort delivery queue; do not await network delivery on the execution path. Guard custom trace/reporter implementations too: the generic runtime currently calls optional `withSpan` directly and cannot promise isolation from arbitrary adapter bugs. Missing telemetry is acceptable and observable through local delivery/drop counters.

## Implementation and acceptance boundary

The minimal change crosses `@kortyx/hooks`/`kortyx` exports, the runtime hook bridge, native tool dispatcher and replay paths, telemetry contracts, both adapters, API ingestion normalization, and Studio trace/event presentation. No MCP or application permission-policy changes are needed. Existing enum validation rejects unknown event types for the entire batch, so release API/Studio contract support before enabling new SDK facts, or negotiate capabilities; otherwise unrelated run telemetry could be discarded along with new tool events.

Before calling the API supported, convert these characterization probes into behavior tests and add acceptance coverage for concurrent sibling children, repeated tools and retries, partial-loop replay, reused whole children, rollback/restoration, abort before dispatch and during execution, invalid/throwing classifiers, throwing custom span/reporters, overflow/retry and duplicate delivery. Verify there is one actual tool execution record when the same factory runs through native dispatch and one reused record when cached. Test safe codes and privacy in outbound batches, not only redacted Studio views.

The key end-to-end acceptance case is a direct `read_job_knowledge` returning application denial inside a child whose parent handles it normally: SDK result **Completed**, telemetry root/child completion preserved, one tool **Denied** row with code/duration and correct run/branch/invocation/node, no credentials or raw inputs/results in the outgoing batch. Repeat after resume and fork, distinguishing reauthorization execution from explicitly cached reuse. A browser test must verify visible labels, filters and inspector navigation after hydration. The initial characterization established the missing behavior. These probes now assert supported behavior, including denied calls in completed workflows, native replay, cached child restoration and concurrent ownership.

Evidence: [end-to-end characterization tests](../../test/observability/direct-tool-observability.test.ts), [native crosscheck probes](../../test/observability/native-tool-lifecycle.test.ts), [source-resolution config](../../test/observability/vitest.config.ts), [disposable runner](../../scripts/probe-direct-tool-observability.sh).
