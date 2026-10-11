# SDK and Studio usage telemetry

Kortyx maintainer telemetry should show which features installations actually use, which operations fail, and whether releases improve reliability and adoption. The first instrumentation should cover SDK execution, streaming, models and tools, plus Studio setup, data loading, and investigation workflows. Prompts, evals, persistence, and updates provide valuable additional boundaries.

This inventory covers the public SDK, CLI, shared Studio UI, and supporting OSS API. Source references describe revision `29705509`, reviewed on 2026-10-11. This inventory distinguishes opportunities from the initial implementation. The [shared helper](../../packages/usage-telemetry/README.md) documents implemented boundaries, controls, aggregate records and the collector proposal; rows below also include follow-up work.

## Existing boundaries

- `kortyx` exposes agent execution, chat, workflow hooks, prompts, evals, MCP, persistence, and stream utilities. See [the SDK facade](../../packages/kortyx/src/index.ts) and [browser facade](../../packages/kortyx/src/browser.ts).
- `@kortyx/telemetry` sends optional customer observability to Studio. [The adapter](../../packages/telemetry/src/adapter.ts), line 39, accepts a customer's endpoint and API key. [Hook event delivery](../../packages/hooks/src/workflow-telemetry.ts), line 8, returns immediately without a configured reporter. Maintainer telemetry must also work without that adapter.
- Existing failure contracts supply useful categories and codes, but also messages, context, details, causes, and arbitrary application codes. See [failure contracts](../../packages/core/src/errors.ts), line 13. They require a separate allowlisted projection before maintainer collection.
- Studio has server reads, browser reads, same-origin proxies, automatic refreshes, and user actions. A generic fetch wrapper alone cannot distinguish adoption from background activity.
- The public Studio shell has operator scopes and no managed user account. Other distributions contribute through edition adapters. See [the OSS shell](../../apps/studio/src/shell/server.ts), line 7, and [settings extension contracts](../../apps/studio/src/settings/contracts.ts). Shared instrumentation can support other distributions without including their product-specific events here.
- The initial source scan found no maintainer collection. This PR introduces it through the separate usage-telemetry package.

## Questions and measurements

| Question | Measurement | Product decision |
| --- | --- | --- |
| Which features should we harden first? | Feature adoption, operation failure rate, affected installations, severity, and recovery rate, broken down by release | Prioritize broadly damaging failures; investigate rare severe failures separately |
| Where does the product fail most? | Failed operations / completed attempts, grouped by operation, phase, error code/category, adapter, and release | Distinguish registry, graph, provider, persistence, transport, rendering, and setup problems |
| Which features are most used? | Unique active installations using a feature, repeat use across days/weeks, and operation volume | Rank adoption separately from workload volume |
| Which features are least used? | Use among installations where the feature is available; UI exposure-to-action conversion | Distinguish low demand, poor discovery, missing data, and unavailable permissions |
| Do new installations reach value? | First SDK successful execution; Studio setup → reachable API → first visible observation → detail/trace investigation | Improve integration and onboarding |
| How long does activation take? | Elapsed time between observed funnel milestones on the same installation | Locate setup friction; this does not measure time since an unobserved npm download |
| Did a release make things worse? | Comparable operation failure rates and latency distributions by SDK/Studio/API version, adapter, runtime, and feature combination | Find regressions and validate fixes |
| Which integrations deserve compatibility work? | Provider families, MCP transport types, workflow sources, persistence/cache configurations, and associated outcomes | Focus compatibility tests and documentation |
| Do failures lead to successful recovery? | Failed attempt followed by a successful retry, reconnect, resume, or update recovery within a defined window | Improve diagnostics and recovery paths |
| Is Studio helping people investigate? | Run detail → trace item/model IO/error diagnostics; workflow metrics → matching runs; follow-on eval or review actions | Find useful investigation paths and dead ends |
| Are advanced features becoming useful habits? | First use → repeated use of prompts, evals, interrupts, child workflows, saved views, reviews | Decide whether to improve onboarding or functionality |
| Are observability integrations healthy? | Export failures, queue drops, rejected ingest, protocol/schema mismatch, live reconnects, and fallback refresh activity | Find loss of visibility before users report it |
| Do rollouts help or harm? | Actual feature exposure and subsequent operation outcome, tagged with a bounded flag key and variant | Evaluate changes after feature flags are introduced |

These are proposed Kortyx measurements, informed by developer-tool and analytics practice. [Next.js telemetry](https://nextjs.org/telemetry) illustrates collecting feature use, versions, and performance while excluding file paths, environment variables, logs, and serialized errors, with opt-out and local debug inspection. [PostHog funnels](https://posthog.com/docs/product-analytics/funnels) support identifying drop-off and time to convert; [retention](https://posthog.com/docs/product-analytics/retention) uses a start action and a subsequent return action. For Kortyx, those actions should express value rather than merely opening a page.

### Interpreting the answers

SDK and OSS counts represent observed installations or browser actors, not people or all downloads. One installation can serve many people; one deployment can have many processes. Fresh container IDs can inflate adoption, and shared IDs can undercount it. Identity lifetime and persistence need explicit design.

“Favorite” is a hypothesis from adoption and repeat use, not a satisfaction score. High run volume can come from one application. An unused interrupt inspector may simply belong to an installation with no interrupts. An eval launch button unavailable to a read-only operator should not contribute to its eligible denominator.

A successful run does not establish answer quality or task correctness. Eval verdicts, end-user feedback, and human reviews address different questions. Maintainer telemetry should initially measure use and reliability of these features; customer ratings, criteria, and review text remain customer observability data.

## SDK opportunities

First = initial coverage for activation and reliability. Next = deeper feature and compatibility coverage. Later = add when the initial measurements expose a decision worth supporting. Source line numbers identify the relevant entry point, not a prescription to add an event on that exact line.

| Priority | Boundary and source | Proposed fact and safe dimensions | Answers |
| --- | --- | --- | --- |
| First | Agent setup: [createAgent](../../packages/agent/src/chat/create-agent.ts), line 270 | `usage.operation`, operation `sdk.initialize`: SDK version, registry source enum, persistence/cache kind, prompts configured, customer observability configured. Track deferred registry readiness separately from constructor return | Who activates; which configuration combinations matter |
| First | Execute/resume admission: [executeWorkflow and resumeWorkflow](../../packages/agent/src/execution/execute.ts), lines 160 and 228 | `usage.operation`, operation `sdk.execute` or `sdk.resume`, phase `admission` when rejected; known request/configuration codes, outcome, duration | Invalid input, workflow lookup, missing state, resume mismatch, and other failures before orchestration |
| First | Execution completion: [orchestrateGraphStream](../../packages/agent/src/orchestrator.ts), line 185; terminal outcome around line 1899; [resultFromOutcome](../../packages/agent/src/execution/execute.ts), line 65 | One logical attempt outcome: completed, failed, cancelled, suspended, or limit reached; bounded error classification; execution mode; feature counts; duration | Root execution reliability, release regressions, first success |
| First | Chat setup and response lifecycle: [streamChat](../../packages/agent/src/chat/process-chat.ts), line 54; [HTTP adapter](../../packages/agent/src/adapters/http.ts), line 293 | Chat admission, time to first visible output, visible response outcome, disconnect policy and actual disconnect; separate background execution outcome | Slow streaming, premature response closure, continue-on-disconnect adoption |
| First | Model operation: [runReasonEngine](../../packages/hooks/src/reason-engine.ts), line 132 | Model operation outcome; allowlisted provider family; requested/effective streaming; text/structured response format; tools enabled; duration and first output latency | Provider compatibility, stream fallback, refusals, timeouts, structured-output problems |
| First | Tools: [executeObservedTool](../../packages/hooks/src/tool.ts), line 258; non-executed facts at line 363 | Direct/model calling mode, native/MCP source, executed versus reused, success/denied/fault/cancelled/suspended, duration. Aggregate counts rather than one public event per tool call | Direct tools versus model tools, failure rates, approval/denial behavior |
| Next | Registry loading and workflow validation: [file registry](../../packages/runtime/src/registry/file-registry.ts), line 39; [validateWorkflow](../../packages/core/src/workflow/validate.ts), line 17 | In-memory/file/custom registry; code/JSON/YAML source; load/validation result; known issue code; bucketed workflow/node/edge counts | Difficult setup paths and declarative workflow adoption |
| Next | Graph nodes and transitions: [createExecutionGraph](../../packages/runtime/src/graph/create-execution-graph.ts), node execution around line 419 | Aggregate node attempts, retries, dynamic transitions and outcomes; bucket graph size. Report a known runtime invariant failure distinctly | Graph complexity, retry/replay problems, runtime hot spots |
| Next | Structured output validation: [reason parsing](../../packages/hooks/src/reason/parsing.ts), line 77 | Validation result, structured format enum, known parsing/contract error code; no schema, field paths, or returned text | How often structured output fails and under which provider/runtime combinations |
| Next | Structured delivery and early response completion: [structured emission](../../packages/hooks/src/structured.ts), line 15; [completeResponse](../../packages/hooks/src/complete-response.ts), line 17 | Aggregate use and validation outcomes for `set/append/text-delta/final`; early-response completion attempted/succeeded/rejected; no custom data type, schema ID, path, or content | Structured UI adoption and correct separation of client delivery from background execution |
| Next | Interrupts and limits: [resumeWorkflow](../../packages/agent/src/execution/execute.ts), line 228; [orchestrator](../../packages/agent/src/orchestrator.ts), limit handling around line 1735 | Interrupt kind, suspension/resume outcome, bounded resume rejection reason, limit kind. Separate manual wait, cancellation, expiration, and a runtime failure | Whether human-in-the-loop works reliably and which limits are reached |
| Next | Child workflows and parallel joins: [workflow hook](../../packages/hooks/src/workflow.ts), [call service](../../packages/runtime/src/graph/call-workflow.ts), line 41; [parallel](../../packages/hooks/src/parallel.ts), line 97 | Child call and parallel group use, bucketed fan-out, completed/reused/suspended/failed, replay/contract mismatch code | Advanced orchestration adoption and failure concentration |
| Next | Prompt management: [createPrompts](../../packages/prompts/src/source.ts), line 57; `resolve` at line 220 | Resolve/compile/pin outcome; source `studio/local/cache/fallback/eval`; fallback attempted/served/rejected; known prompt code | Prompt adoption, source reliability, stale fallback and pin problems |
| Next | Eval runner: [createEvals](../../packages/agent/src/evals/create-evals.ts), line 96; `run` at line 211; final result around line 742 | Runner operation outcome; grading location, bucketed cases/repetitions/concurrency; counts of passed/failed/error/cancelled/ungraded; known execution error phase | Eval infrastructure reliability and local versus Studio grading use |
| Next | MCP connection and discovery: [createMCPClient](../../packages/mcp/src/index.ts), line 124; tool discovery at line 142 | Connect/discover/close result; `stdio/sse/http` transport enum; bucketed discovered tool count; use `other` for unsupported future types | Integration compatibility and discovery failures |
| Next | Checkpoints and persistence: [agent checkpoint operations](../../packages/agent/src/chat/create-agent.ts), line 407; [adapter selection](../../packages/runtime/src/framework/adapter.ts), line 185; [caching adapter](../../packages/runtime/src/framework/caching.ts) | Fork/rollback/read/write/lease outcome; storage kind and separate cache kind; aggregate cache hit/miss/fallback; known persistence stage | Which adapters are adopted and where resumability or durability fails |
| Later | Browser stream transport and reducers: [streamFromRoute](../../packages/stream/src/client/stream-from-route.ts), line 46; [browser exports](../../packages/kortyx/src/browser.ts) | Transport/parser result; malformed stream, non-OK HTTP status, missing body, premature end, abort; structured reducer contract result | Browser delivery problems that server completion cannot reveal |
| Next | Customer observability delivery: [createDelivery](../../packages/telemetry/src/delivery.ts), line 9 | Aggregate batches delivered, failed, retried, rejected, events dropped, and queue occupancy buckets; classify status only | Silent exporter failures and why successful SDK runs do not appear in Studio |
| Later | Handled errors and state hooks: [reportError](../../packages/hooks/src/report-error.ts), line 5; [hook exports](../../packages/kortyx/src/index.ts) | Feature presence/counts in execution summaries; separately classify known handled-error sites only when a safe code exists | Adoption of error reporting and node/workflow state; recovered errors that do not fail the root run |
| Next | CLI integration tasks: [topology push](../../packages/cli/src/index.ts), line 511; [eval commands](../../packages/cli/src/evals/command.ts), line 47 | Fixed command identifier and stage outcome, CI marker, source kind, elapsed time; no argument values | Where integration instructions and CI workflows fail |

### SDK measurement traps

`createAgent` returns before its registry promise resolves. Constructor success is not integration success. Execution admission can reject before a run ID exists, so terminal orchestration alone misses important onboarding failures.

`streamChat` returns an asynchronous stream while orchestration continues. Resolving that promise or returning HTTP 200 is not execution success. Measure terminal execution independently from visible response completion. The response can finish while background nodes later fail. Client disconnect can be intentional and does not automatically indicate a Kortyx defect.

`runReasonEngine` can force effective streaming off when tools are present and the provider cannot stream tools. Its provider model construction also precedes the internal execution `try` block. A future wrapper must cover both admission and actual generation, and distinguish requested from effective behavior.

The tool boundary already distinguishes executed calls from non-executed facts. Replayed observations, cached child results, denied admission, and waiting approvals must not increase the actual execution denominator. MCP can return `isError` without throwing; promise resolution alone is insufficient to classify it as success.

The eval runner separates a failed quality assertion from an execution error. An eval that correctly reports a bad answer has done its job. Count grading verdicts separately from runner, target, judge, cleanup, reporting, and lease failures.

The persistence adapter's `kind` is insufficient to describe every composite configuration. Track durable storage and cache independently rather than collapsing Postgres plus Redis into one inferred label.

Pure helpers, schema creation, module imports, and simple getters do not need individual usage events. Feature counts should come from actual execution or deliberate configuration use. Where standalone APIs bypass the agent, they need their own bounded boundary rather than assuming every consumer calls `createAgent`.

## OSS Studio opportunities

The same UI events can identify `oss_studio` or an edition-registered product from trusted deployment context. Server operations must report their own outcomes even when the browser closes. Browser actions supply intent and discovery information that server request counts cannot provide.

| Priority | Boundary and source | Proposed fact and safe dimensions | Answers |
| --- | --- | --- | --- |
| First | Local installation: [startStudio](../../packages/cli/src/studio/local-stack.ts), line 204 | `studio.setup.finished`: Docker preflight, state/credentials preparation, image pull, port check, compose/health, rollback; outcome and elapsed time | Why people cannot get Studio running; first-install versus restart friction |
| First | Initial connection: [fetchJson](../../apps/studio/src/lib/studio-api.ts), line 63; [auth adapter](../../apps/studio/src/auth/server.ts), line 48 | API configured/reachable/authorized/compatible states; fixed resource/operation; `not_configured/http/parse/network` classification; auth mode enum | Setup failures, API mismatch, authorization and network failures |
| First | First observation: [first-use check](../../apps/studio/src/features/telemetry/first-use.ts), line 24; [FirstObservation UI](../../apps/studio/src/features/telemetry/components/first-observation.tsx), line 45 | First-use guidance shown/action selected; data presence observed; first useful detail loaded; resource enum | Connection-to-value conversion and effectiveness of setup guidance |
| First | Navigation and investigation: [RunsPageClient](../../apps/studio/src/features/runs/components/runs-page-client.tsx), line 97; [RunDetail](../../apps/studio/src/features/runs/components/run-detail.tsx), line 33; [DetailTabs](../../apps/studio/src/components/detail/detail-tabs.tsx), line 42 | `usage.feature`: resource and action enums, detail entry source, selected tab, available tabs, viewed run status; load result separately | Which inspection surfaces are used and which fail to load |
| First | Studio API reliability: [server reads](../../apps/studio/src/lib/studio-api.ts), line 63; [browser fetch](../../apps/studio/src/lib/studio-fetch.ts), line 4; [prompt client](../../apps/studio/src/features/prompts/api/client.ts), line 3; [eval client](../../apps/studio/src/features/evals/api/client.ts), line 2 | `studio.operation.finished`: fixed operation, outcome, coarse HTTP status, known code, parse/network phase, duration, request origin | Failure rates by resource and action without counting every request as adoption |
| First | Route rendering and retry: [StudioRouteError](../../apps/studio/src/features/telemetry/components/studio-route-error.tsx), line 5 | Bounded route template and known error family, route failure observed, retry requested, subsequent successful load | Broken pages and whether retry helps |
| Next | Trace and model IO: [RunTrace](../../apps/studio/src/features/runs/components/run-trace.tsx), line 111; [RunModelIO](../../apps/studio/src/features/runs/components/run-model-io.tsx), line 32 | Trace item kind selected, model IO tab/filter used, missing-content state; no trace IDs, payloads, prompts, names, or content | Whether people inspect tool/model errors and whether useful evidence is available |
| Next | Search and saved views: [useRunsQuery](../../apps/studio/src/features/runs/hooks/use-runs-query.ts), line 127; [runs views](../../apps/studio/src/features/runs/components/runs-views-menu.tsx), line 32; [shared views menu](../../apps/studio/src/features/telemetry/components/list-views-menu.tsx) | Filter kind applied, search used, results empty/nonempty, saved view created/applied/deleted, sort/range preset; no query text or saved-view names | Discovery of filtering, repeated investigation workflows, search dead ends |
| Next | Workflow map and metrics drill-down: [workflow toolbar](../../apps/studio/src/features/workflows/components/workflow-toolbar.tsx), line 65; [inspector](../../apps/studio/src/features/workflows/components/workflow-inspector.tsx), line 358; [tools panel](../../apps/studio/src/features/workflows/components/workflow-tools.tsx), line 140 | Map/catalog/metric mode selected; node/tool kind inspected; View runs clicked and target loaded; dimension enum | Whether topology and aggregated metrics lead to useful investigations |
| Next | Sessions, interrupts, and child calls: [feature directories](../../apps/studio/src/features), [run details](../../apps/studio/src/features/runs/components/run-detail.tsx), line 154 | Detail opened, child/parent navigation, interrupt status, session history navigation; loaded versus empty/error | Adoption of cross-run and interrupted-execution investigation |
| Next | Live mode: [createLiveRefreshController](../../apps/studio/src/features/telemetry/lib/live-refresh-controller.ts), line 46 | Enabled/paused/live/reconnecting state changes; accumulated live/unhealthy time; manual versus fallback refresh; refresh failure and reconnect counts | Whether live updates work and how often polling hides a broken stream |
| Next | Prompt lifecycle: [PromptDetail](../../apps/studio/src/features/prompts/components/prompt-detail.tsx), action boundary line 399; [prompt mutation contracts](../../packages/telemetry-contracts/src/prompts.ts), line 197; [import](../../apps/studio/src/features/prompts/components/prompt-import.tsx), line 63 | Create/draft/save/discard/promote/review/policy/tag/group/import/export action; submit/commit/failure; conflict code; counts and source enum | Prompt authoring adoption, draft conflicts, import failure, version promotion friction |
| Next | Eval workflow: [EvalRunSetup](../../apps/studio/src/features/evals/components/eval-run-setup.tsx), line 189; [eval run client](../../apps/studio/src/features/evals/components/eval-run-page-client.tsx), line 53; [worker](../../apps/api/src/evals/worker.ts), line 52; [execution](../../apps/api/src/evals/execute-evaluation.ts), line 13 | Target availability, setup shown, launch accepted/rejected, execution finished, cancellation, case inspection/comparison; grading location, prompt selection mode, bucketed scale | Target setup friction, launch reliability, evaluation adoption and comparison use |
| Next | Human review: [RunFeedback](../../apps/studio/src/features/feedback/components/run-feedback.tsx), line 117; [review API](../../apps/api/src/routes/scores.ts), line 136 | Review editor opened; save/clear committed/failed; write permission available | Whether review is useful and whether permissions or saves block it |
| Next | Settings and credentials: [operator settings](../../apps/studio/src/settings/operator-settings.tsx), [settings server](../../apps/studio/src/settings/server.ts), [credential commands](../../packages/cli/src/studio/local-stack.ts), line 166 | Fixed settings section visited; connection guide copied; key creation/rotation result where actually implemented; setup-required/read-only states | Common configuration needs and access friction |
| Next | Upgrade and recovery: [updater engine](../../apps/api/src/updater/engine.ts), line 39; [updates UI](../../apps/studio/src/components/studio-updates.tsx) | Update offered/started; backup/validation/migration/health/completion/failure phase; installed and target Kortyx release; manual/automatic trigger | Release adoption and unsafe or failing upgrade paths |
| Next | Supporting ingest and protocol: [telemetry routes](../../apps/api/src/routes/telemetry/events.ts), line 63; [health](../../apps/api/src/routes/health.ts), line 67 | Aggregate accepted/rejected/deduplicated batch counts, known validation/authorization/protocol error, API version, storage error phase | Why connected producers do not result in visible Studio data |

### Studio measurement traps

`hasNoObservations` performs an all-time check after an empty page and excludes read errors. Preserve that distinction: a filtered empty list or unavailable API is not a new installation. A “first observation seen” event measures the first observation detected by this instrumentation, not necessarily when the installation originally received data.

Live refresh automatically reads after connection, refreshes on change notifications, and polls while unhealthy. Requests also arise from SWR revalidation, eval polling, server rendering, prefetching, and retries. These support operational reliability counts; they must not inflate feature adoption or page-view counts. Record navigation after the visible route settles and user intent in action handlers. Deduplicate React rerenders and development Strict Mode effects.

The shared `DetailTabs` component is a useful boundary but needs an explicit surface identifier. A tab called `overview` is ambiguous across runs, prompts, and evals. Record available tabs as a bounded set to give conditional tabs an eligible denominator.

Browser prompt/eval helpers currently throw `Error` objects containing a response message. They do not preserve a dedicated structured status/code contract for callers. The future helper design should preserve a safe operation/status classification without treating the message as a telemetry property. Instrument server reads and browser helpers as well as the common fetch layer; explicit scoped prompt reads can bypass `studioFetch`.

Prompt draft autosave is not one deliberate feature adoption event per keystroke. Aggregate autosave outcomes, report an edit session or explicit version save once, and distinguish a committed mutation from a subsequent refresh failure. Likewise, eval launch acceptance is not eval completion. API workers own completion even if the page is closed.

A request to show a failing customer run is a successful Studio operation if the view loads correctly. Customer run failure, Studio request failure, and SDK failure are separate facts. Review/feedback comments, eval inputs and criteria, and prompt content must not enter maintainer analytics.

Trace inspection time is a proxy for investigation activity, not measured time to fix a customer problem. Measuring diagnosis or resolution directly would need a deliberate feedback signal or a future issue lifecycle; page navigation alone cannot establish it.

## Implemented event families

The helper emits two stable families: `usage.operation` for bounded outcome/duration aggregates and `usage.feature` for adoption/configuration facts. `operation`, `product`, `component` and approved properties provide the semantic scope. Both carry `count`; raw PostHog event count is a count of aggregate groups, not attempts.

Initialization is `sdk.initialize`; direct execution, chat admission, terminal execution and response completion have distinct operations. Studio intent, server reads and background live refresh use distinct operations/origins. Unknown catalog operations are dropped. Remaining inventory rows can reuse these families once their ownership and denominators are defined.

First successful execution and observed Studio data can be derived from these records within the retention window. Exact installation-first milestones and exact funnel timing need additional lifecycle design because collection is aggregated and best effort. See the helper README for implemented boundaries and limits.

## Failure classification

Track operation outcome separately from error origin and whether an SDK defect is suspected. An initial bounded vocabulary can project known Kortyx categories into configuration, validation, provider, application/domain, workflow, persistence, transport, internal, and unknown. Unknown errors must stay unknown; the existing serializer's generic `internal` fallback is not proof of a Kortyx bug.

Use known Kortyx code and call-site identifiers for grouping. Map arbitrary provider IDs, error names, application codes, custom denial codes, and unknown codes to fixed categories or `other`; do not transmit them verbatim. A call site such as `runtime.checkpoint.append` provides a stable clue without transmitting a stack or customer node name. Do not hash error messages, prompt IDs, or customer names as a substitute for excluding them.

Cancelled, denied, suspended, expected not-found, and reached execution limits need their own outcomes. Recoverable attempts should contribute retry/degradation counts while a subsequently successful logical operation remains successful. [OpenTelemetry's error-recording guidance](https://opentelemetry.io/docs/specs/semconv/general/recording-errors/) similarly distinguishes context-dependent failures and handled retries from terminal operation errors and recommends consistent outcome information on duration measurements. Kortyx's maintainer schema can use that distinction without forwarding observability spans.

For prioritization, show all-operation failure rate and suspected Kortyx defect rate separately. Rank using affected installations, severity, exposure, and failure rate together. Include minimum attempt counts and uncertainty; a single failure in one attempt should not outrank a widely reproducible regression solely because its rate is 100%.

## Shared context and privacy

Every event or summary needs a schema version, event ID, timestamp/window, product, emitter component, Kortyx component version, analytics environment, and identity scope. Operation events additionally need a known operation/phase, outcome, duration or duration bucket, and bounded error classification when applicable. Summaries need attempted/completed/outcome counts and their aggregation interval.

Keep these concepts separate:

| Dimension | Meaning |
| --- | --- |
| `product` | `sdk` or `oss_studio`; other distributions register their own product in an extension catalog |
| `host_product` | Potential embedding context for SDK events in another distribution; not emitted in the initial slice |
| `component` | `agent`, `runtime`, `hooks`, `cli`, `studio_ui`, `studio_api`, or `updater`, from a fixed catalog |
| `analytics_environment` | Chooses the maintainer Production/Staging PostHog destination |
| `runtime_mode` | Consumer runtime `development/production/ci/unknown`; does not select the maintainer project |
| `observability_configured` | Whether customer-facing Studio/OTel integration is present; no endpoint or credential |
| Identity scope | Installation, ephemeral process, browser actor, or another explicitly registered identity scope, as actually measured |

OSS Docker currently sets `NODE_ENV=production` even for local installs. Customer-defined observability environment names can also contain sensitive business information. Neither should automatically select a maintainer PostHog project. Explicit deployment/release configuration must supply analytics routing; unknown standalone SDK installations need a documented default.

Edition adapters select one product for a shared UI action. Embedded SDK operations remain SDK facts unless explicitly configured by the embedding integration. Avoid double-counting an eval operation at UI, API worker, and nested SDK levels by using different operation scopes and one owner for each outcome.

Allowed data should initially be release versions, fixed feature/operation identifiers, known error codes, coarse HTTP status, provider family, transport/storage types, finite outcome enums, bounded counts/durations, and feature-presence booleans. Custom providers/models map to `other`; model names and consumer application versions are excluded unless a later explicit catalog justifies them.

Exclude prompts, messages, inputs/outputs, tool arguments/results, schemas, workflow/node/tool names, source code, file paths, custom model endpoints, URLs and query values, environment-variable values, credentials, database connection strings, tenant/project names, customer run/session/trace IDs, arbitrary metadata, and error messages/stacks/causes. The initial transport bypasses the browser analytics SDK and explicitly omits browser referrers and cookies; no automatic URL capture is enabled. Truncation is not sanitization.

Generate a random maintainer identifier rather than deriving it from customer identifiers or machine fingerprints. A stable identifier is pseudonymous, not automatically anonymous. Define its storage, retention, reset behavior, cross-process sharing, and browser/server relationship before interpreting unique installation counts. Independent SDK applications cannot be assumed to share an identity with an OSS Studio install; cross-product funnels require an explicit integration mechanism.

The planned default-on collection with an environment opt-out needs documented collection scope and a local debug mode that prints approved event shapes without sending them. Proposed names are `KORTYX_USAGE_TELEMETRY_DISABLED=1` and `KORTYX_USAGE_TELEMETRY_DEBUG=1`; both are implemented by the helper. The env setting must propagate through CLI-generated compose, Studio server, API, updater, and browser bootstrap. Disabling maintainer usage collection must stop identifier creation and network collection without disabling customer observability.

## Volume and useful dashboards

Sending every node, token chunk, tool call, poll, and autosave would make event volume reflect traffic and refresh frequency. Aggregate hot paths by fixed windows and bounded dimensions. Keep activation and meaningful UI actions distinct. Rare failures still need deduplication and caps because a failure loop can overwhelm the budget.

Keep sampled rates and counters mathematically consistent. If failures are retained more often than successes, raw event percentages are biased. Aggregate success and failure counts with the same policy, or carry the actual inclusion probability and calculate weighted rates. Approximate duration histograms must use defined buckets; percentiles from sampled operation events need a representative sample. Do not mix individual operations and summaries as interchangeable attempts.

The configured $0 limits remain a financial control, not a guarantee of complete measurements. Collector limits, PostHog drops, disabled clients, offline installs, and early process termination produce missing observations. An absent terminal event is not automatically a crash. Count health and drops without reporting recursive collector errors through the same instrumented path.

| Dashboard | Initial panels |
| --- | --- |
| SDK reliability | First successful execution; attempts/outcomes by operation; affected installations; known failure sites by release; duration distributions; provider/storage/streaming breakdowns |
| SDK adoption | Active observed installations; feature penetration; repeated feature use; workflow source, prompts, evals, MCP, interrupts, child/parallel use; observability adoption |
| Studio activation | Setup phases; connection outcomes; guidance → first observation → detail investigation; elapsed time between milestones |
| Studio workflows | Trace/model IO/diagnostics adoption; metrics-to-runs drill-down; filter and saved-view use; prompt editing/promotion/import; eval launch-to-completion-to-comparison; review save success |
| Studio reliability | Request/render errors; protocol/parse mismatch; foreground latency; live unhealthy time; exporter/ingest drops; update failures by phase/version |

Use event properties and installation identifiers for the initial reports. Paid group analytics is not necessary merely to break down by product or version; account-level retention and cross-actor analysis in other distributions require their own identity and aggregation design.

## Implementation order

1. Define the catalog, safe error projection, identity scopes, opt-out propagation, collection ownership, and volume policy in the shared helper design. Keep Node/server and browser entry points separate; the SDK browser facade must remain free of Node imports.
2. Implement initial SDK setup/admission/terminal execution and Studio setup/connection/first-observation/inspection boundaries. Verify outcome denominators, async-stream completion, and zero collection when opt-out is enabled before shipping default-on collection in releases.
3. Add aggregate model/tool counts and known failure sites, then prompts, evals, persistence, live refresh, export/ingest, and upgrades. Each addition should name the decision it enables and its eligible population.
4. Add feature exposure alongside future flags, plus deeper comparison/recovery questions when the first dashboards show a need.

The helper should own schema validation, privacy projection, context, safe classification, identity, aggregation, deduplication, opt-out, batching, bounded delivery, and local inspection. Product modules should supply semantic facts at the boundaries above. A Kortyx-owned public collector can validate and rate-limit approved facts before forwarding to PostHog; customers need no personal API key. The collector endpoint, abuse controls, and routing remain design work.

Telemetry must never change execution results, add awaited network calls to operation latency, retain the process through timers, interfere with cancellation, or mutate replay/checkpoint state. Global uncaught-exception handlers in a library would capture unrelated host application errors; explicit Kortyx boundaries provide a more useful scope.

The first slice implements identity persistence, browser opt-out bootstrap, streaming outcome ownership, a bounded error catalog and aggregate counters. Follow-up work should validate dashboards against real adoption patterns and add the remaining high-value boundaries and an organization-wide collector budget.
