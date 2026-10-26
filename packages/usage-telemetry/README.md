# Kortyx usage telemetry

Maintainer usage telemetry measures adoption and reliability of the SDK, CLI and OSS Studio. It is separate from customer observability in `@kortyx/telemetry` and `@kortyx/otel`. The default destination is Kortyx's EU PostHog Production project, using its public capture key. Consumers need no personal API token.

## Controls

Set these in the SDK process or Studio deployment environment. CLI-generated Compose forwards the same controls to API, Studio and updater containers; restart the containers after changing them.

| Variable | Effect |
| --- | --- |
| `KORTYX_USAGE_TELEMETRY_DISABLED=1` | Stops collection, identity creation and queued delivery; `true` is also accepted |
| `KORTYX_USAGE_TELEMETRY_DEBUG=1` | Prints approved records locally, without creating identities or sending requests |
| `KORTYX_USAGE_TELEMETRY_POSTHOG_KEY` | Overrides the public `phc_` capture key, for example for maintainer staging |
| `KORTYX_USAGE_TELEMETRY_POSTHOG_HOST` | Overrides the ingestion host; defaults to `https://eu.i.posthog.com` |
| `KORTYX_USAGE_TELEMETRY_ENDPOINT` | Replaces PostHog with a collector accepting `{ identity, records }` |
| `KORTYX_USAGE_TELEMETRY_ENVIRONMENT=staging` | Labels maintainer staging; pair it with that project's capture key |
| `KORTYX_USAGE_TELEMETRY_TRAFFIC_SOURCE` | Explicit `internal`, `synthetic` or `external` cohort; otherwise `unknown`. CI does not imply synthetic traffic |
| `KORTYX_USAGE_TELEMETRY_ID` | Optional random UUID for deliberate identity sharing between Node processes |

Tests (`NODE_ENV=test`) disable the default Node integration. Consumer `NODE_ENV` and `CI` supply a coarse runtime mode; they do not select the maintainer project. Browser bootstrap receives only public configuration from Studio's server environment, so no `NEXT_PUBLIC_` variables are needed. Debug output contains approved dimensions and aggregate counts, never application payloads.

Node delivery lazily stores a random installation UUID in `~/.config/kortyx/usage-id` (new directory mode 0700, file 0600). Read-only installations use a process UUID instead. Removing the file resets the identity after restarting the process. Browsers lazily store a separate random UUID in local storage at `kortyx.usage.id`, falling back to an in-memory UUID if storage is unavailable. Clear this key and reload to reset it. Browser/server identities are independent; they do not establish a cross-product funnel. These are pseudonymous identifiers, not people or authenticated accounts.

## Approved data and bounded delivery

The shared catalog allows fixed operation names, outcome enums, Kortyx release versions, provider families, storage/transport kinds, coarse HTTP status, known error codes and booleans. Arbitrary property keys are dropped; unrecognized enum values and error codes become `other`. The error projection reads only own data properties and does not invoke application getters.

Sample chapters use the bounded `studio.sample` chapter/step catalog, including
optional `error-diagnostics` and `evaluation-progress`. Optional starts/completions
have their own chapter denominator and do not increase the six-chapter full-tour
denominator. Completion is a displayed-guide outcome, not proof of learning.

Studio page explanations use `studio.help` with finite `help_page`, `help_step`,
`help_context` (real/sample), and `help_action` values. Starts count explanation
attempts; step events count displayed steps, including Back. Completion, skip,
exit, error, and example request/accept/cancel distinguish local help from a
confirmed sample transfer. Compare completions against starts within the same
page/context cohort, accounting for best-effort delivery and abandoned tabs.
Record identifiers, URLs, selectors, setting values, and page content are excluded.
Page-help facts are allowed in sample views while ordinary execution metrics remain
suppressed; they do not measure SDK activation or customer execution outcomes.

Prompts, inputs/outputs, messages, schemas, workflow/node/tool names, URLs, paths, custom application error codes, customer IDs, credentials, raw errors and stacks are excluded. Capture requests omit browser cookies and referrers, disable PostHog person profiles and geolocation enrichment, and send `$ip: null`. Network infrastructure still receives a request's source IP; the payload is not proof of legal anonymity. There is no autocapture, session replay or global exception handler.

Records aggregate matching operations, outcomes and approved dimensions over a 60-second flush window. A scope finishes once. Successes and failures use the same counting policy. `usage.operation` records reliability and duration; `usage.feature` records deliberate adoption or explicit feature configuration. Background reads/refreshes have separate origins and must not be used as click counts.

Each component client buffers at most 64 distinct groups and sends at most 120 groups per hour. A group can represent many attempts through `count`. Duration buckets are noncumulative: ≤10ms, (10,100], (100,1,000], (1,000,10,000], (10,000,60,000], >60,000ms. Query `duration_total_ms / count` for means or combine bucket counts for approximate distributions. Restrict latency queries to `usage.operation`.

Delivery is best effort, single-flight, with a two-second transport timeout, no retries and unreferenced Node timers. SDK operations never await analytics delivery or change results because collection fails. The CLI flushes registered component clients after command parsing/execution, waiting at most two seconds even for a custom transport. Setup stages and command invocations are separate measurements. Browser visibility changes request a flush. Offline, disabled, terminated or short-lived processes can lose records; call the helper's `flush()` explicitly at an application-controlled shutdown boundary when appropriate. No disk event queue or crash detection is implied. `stats()` exposes local pending/dropped/delivered group counts. Budgets are per component and process, not an organization-wide spending guarantee; PostHog's $0 billing limits remain the financial control.

## Reusable boundaries

```ts
import { createUsageTelemetry, publicCatalog } from '@kortyx/usage-telemetry';

const usage = createUsageTelemetry({
  context: { product: 'sdk', component: 'agent', version: '1.0.0' },
  catalog: publicCatalog,
  identity: () => installationUuid,
  transport: myTransport,
});

const scope = usage.start('sdk.execute');
try {
  const result = await execute();
  scope.end();
  return result;
} catch (error) {
  scope.fail(error);
  throw error;
}
```

The root export is browser safe. Bundlers use a browser fallback for the Node entry so portable exports from libraries such as prompts keep working without filesystem imports. That fallback collects nothing automatically; browser usage requires the embedding application's explicit bootstrap or component override, as Studio provides. `@kortyx/usage-telemetry/node` owns filesystem identity, environment controls, EU defaults and a component registry. `configureUsageTelemetry(component, client)` replaces a component client, including after SDK modules have been imported. Component facades resolve the registry at each boundary. Other distributions extend a catalog with their own bounded products/operations/properties and provide a transport; the public catalog contains only public product facts.

Studio uses the `@studio/usage` server adapter and `@studio/usage-contracts` contract, following its existing edition alias pattern. An adapter owns its server client and serializable browser configuration, including an optional extended catalog. Browser configuration chooses one product. `configureStudioUsage(config, extensionClient)` also accepts a custom browser client. API embedders can pass `usage` to `createApiApp`. Never put a personal PostHog token in a browser config or transport.

## Workflow reducer adoption

Successful `sdk.registry` operations carry the boolean `data_reducers`: whether
at least one registered workflow has a callback. Compare `sum(count)` with the
flag enabled against all successful registry operations in the same release cohort
to measure configured adoption. This counts registry resolutions, not workflow
runs or unique workflows. Registries without a `list` method cannot establish
adoption and omit the property. Repeated agent initialization and best-effort
aggregation/delivery affect reach estimates as described above.

Existing execution outcomes allowlist `WORKFLOW_REDUCER_FAILED` as a known error
code for reliability measurement. Reducer field names, callbacks, schemas, values
and raw error messages are never usage properties. Existing opt-out, bounded
aggregation and failure-independent delivery apply unchanged.

## First slice and follow-up opportunities

SDK boundaries include initialization, registry resolution, direct execution/resume, chat admission, terminal graph execution, response completion, model and tool execution, structured output, explicit response completion, prompt resolution, eval outcomes, MCP connection/discovery/close, checkpoint operations and observability export attempts. Early response completion and later graph failure are separate outcomes. An eval quality failure is distinct from an execution error.

Studio boundaries include CLI setup, API requests/ingest, server reads and parse failures, first-use guidance and observed data, navigation, tab/trace inspection, render failures/retries, prompt actions, eval launch/read/cancel and live refresh/reconnect. Prompt and eval browser actions measure request acceptance. The built-in eval worker separately measures persisted terminal results; its attempt and legacy run units are described below. SDK eval configuration rejection is included with phase `configuration`.

Server-side eval reads emit `studio.read` with `resource: evals` and
`origin: server`. Successes and failures share one completed-read denominator.
`eval_read` distinguishes target discovery, history, detail, case, live,
capability, evaluation, table and comparison reads without record IDs or URLs.
HTTP, network, configuration, and response-validation failures carry a bounded
`phase`, classified error/cause codes, HTTP status/class and retryability where
known. Invalid responses use `STUDIO_RESPONSE_INVALID`, `response_failure`
(JSON, schema or body), and the first schema issue's approved `validation_issue`
and top-level `validation_field`. Unknown fields become `other`. Combine these
dimensions with the existing component, release and environment context to
understand a failure; raw messages, stacks and payloads remain excluded. Aborted reads are
cancelled, and sample-project reads are excluded. Additional judge response
fields that can be safely stripped remain successful reads. These records use
the existing PostHog transport and controls, without raw errors or payloads.

The [opportunity inventory](../../docs/audits/sdk-studio-usage-telemetry.md) covers remaining node/parallel/child execution, prompt cache/refresh, persistence internals, exporter queue loss, deeper filters/saved views, deeper worker phases, reviews and upgrade phases. Reserved catalog operations are not evidence that these boundaries already emit. Feature-flag evaluation and exposure are a future addition.

Use `sum(properties.count)`, rather than raw PostHog event count, to measure attempts. For a comparable component/operation cohort, failure rate is `sum(count where outcome = failed) / sum(count for completed operation outcomes)`. Decide explicitly whether cancellations, denial and suspension belong in the denominator. Compare installation reach, repeated use and failure rate by release; do not rank features solely by workload volume. PostHog funnels over aggregates give coarse observed ordering (flush windows can obscure exact ordering), not exact user-session sequences or time since npm installation.

## Measurement quality (version 2)

The envelope remains `schema_version: 1`; additive approved properties carry
`measurement_version: "2"`. Historical events without it retain their old coverage.
Compare matching measurement versions, release, component, operation, origin,
action, analytics environment and runtime mode. Never add up all SDK operations
as workflow executions.

| Unit (`measurement_kind`) | Counting boundary |
| --- | --- |
| `invocation` | One CLI command parse/action outcome or SDK eval `run()` call, including rejected configuration |
| `execution` | SDK terminal graph execution; persisted legacy worker suite run |
| `attempt` | Each model/export send attempt; each claimed eval worker case/repetition attempt |
| `chunk`, `output`, `update` | Structured text deltas, final output, other updates; workload volume, not feature adoption |
| `stage` | A Studio setup phase, separate from CLI command completion |
| `poll` | Background Studio reads, including diagnostic prefetch; not deliberate inspection |
| `request`, `call` | Studio request or other SDK API call outcome |
| `feature`, `observation` | Deliberate/configured use versus server/background observation |

`runtime_mode` uses Node `CI` / `NODE_ENV`, independently of the destination
project. Node factories and Studio browser bootstrap carry the same safe context.
`traffic_source` is explicit: `unknown` is not evidence of external customer use.
Pseudonymous installation/browser/process reach is not a count of customers.

Failures always have an approved `error_code` and `error_category`. Unclassified
explicit failures use `UNCLASSIFIED_FAILURE`; inspected unknown errors use `other`.
The classifier reads at most eight objects, three links deep, following own data
fields `failure`, `cause`, and `error`. Known network codes, HTTP classes, framework
failure descriptors and optional bounded `cause_code`/`cause_category`/`retryable`
help distinguish provider, transport, validation and configuration problems. Eval
failures also project the first issue's approved `eval_phase`; multiple issues in
one run are not a complete failure census.
Messages, stacks, diagnostic IDs and exception serialization remain excluded.
Cancellation, suspension, limits, eval quality failures and ungraded outcomes stay
separate from technical failures. A known category is not proof of a product bug.

Exporter records add bucketed `batch_size`, `retry_attempt`, `retried` and
`recovered`. Recovery means a successful send after a retry, not a correlated
end-to-end delivery guarantee. Recursive split sends are separate attempts.

Each successful normal delivery may carry `usage_dropped_observations` and
`usage_failed_batches` once, as deltas since the last delivered health snapshot.
They include cardinality/budget losses and identity/transport failures; local
`stats().dropped` still counts groups. Health never bypasses budgets, creates its
own event, or persists on disk. Permanently offline, crashed, disabled or restarted
processes cannot report their lost tail. These counters expose observed loss;
they cannot reconstruct unbiased feature shares after selective group dropping.
A failed or ambiguous delivery may have reached ingestion: these counters describe
client-observed loss, not verified server loss.

## Eval and diagnostic boundaries

Eval launch/settings requests record only booleans for explicit settings and
case/run deadline overrides. The SDK `sdk.eval` boundary reports configuration
rejections and safe execution failure codes. Neither timeout values nor judge,
suite, case, input, criteria or output identities are usage dimensions.

The built-in worker emits `studio.eval.execution` only **after** `store.finish`
persists a result. A claimed case/repetition uses `attempt`; a legacy suite run
uses `execution`. Cancellation, technical failure, quality failure, ungraded and
success are separate. Lease loss, process shutdown and a failed persistence write
do not imply completion. Retries/reclaims may execute again; no global deduplication
or evaluation-level completion funnel is promised.

A custom `EvalJobStore` keeps instrumentation ownership by default. Embedders may
supply `EvalWorkerOptions.usage` to opt in, or `false` to disable worker emission.
Choose one owner: either the existing store wrapper or this injected helper.
Use the same replacement catalog in its helper. Existing custom store adapters do
not acquire a second public emitter when upgraded. The dispatcher also accepts
`usage` / `false`; the worker forwards the chosen client or disables dispatch
collection for a custom store. Retry observations use `origin=server` and are
separate from terminal results. Standalone dispatcher defaults use component
`eval_dispatch`, correcting the formerly invalid component spelling.

Studio emits a `studio.diagnostic` feature on deliberate error-detail inspection,
and separately records background diagnostic reads and their failures. Shared table controls emit bounded
`studio.table.layout` interaction actions, including resize initiation, without
column names, sizes or saved layout content. Neither
path sends the displayed error content. Customer-authenticated diagnostic storage
continues to serve original errors independently.

## Proposal: replace direct capture with a Kortyx collector

Keep direct EU capture for this slice. A later collector can accept the existing versioned record envelope, validate the catalog again, cap body/group/count sizes, rate-limit installations and total daily ingestion, deduplicate `event_id`, strip network metadata, and route approved releases to the intended PostHog project. Keep retention and operational logs bounded and avoid logging request bodies. Forward asynchronously with its own retry/deduplication policy.

This moves abuse controls and global budgets to an owned boundary: a public PostHog capture key can be copied and spoofed, so client caps alone cannot protect ingestion or establish authenticity. Replace the transport or set `KORTYX_USAGE_TELEMETRY_ENDPOINT`; product instrumentation does not change. Endpoint deployment, global limits and project routing belong to that follow-up. Existing released SDK versions continue direct capture until upgraded, so migration must account for them.

### Studio contextual help

`studio.help` counts feature interactions using `help_action: open | documentation`
and `help_placement: card | button`. Count closed-to-open card transitions once;
count documentation navigation intent separately. Compare summed card-footer
navigation counts with summed card-open counts to assess help use. Standalone
button clicks are a separate population, and these aggregates do not establish
unique users, successful page loads, or completed reading. Existing opt-out,
budgets, aggregation and best-effort delivery apply. No help labels, descriptions,
URLs, customer identifiers or execution content are collected. This measures
maintainer product usage separately from customer execution observability.

## Topology publication measurement

`cli.command` counts each `topology.push` invocation once, including dry runs.
The allowlisted `topology_strict` boolean records whether optional strict discovery
was selected. A blocked publication reports `KTX_TOPOLOGY_INCOMPLETE`, validation
category and `retryable: false`; the CLI's existing terminal outcome and opt-out,
bounded delivery and exporter-failure behavior apply. Compare `sum(count)` for
strict invocations with all topology-push invocations to measure adoption, and
blocked strict invocations with all strict invocations to measure rejection rate.
Do not interpret a successful invocation as complete discovery when strict mode
is off or intentional dynamic calls are exempt. Paths, expressions, import traces,
credentials and diagnostic messages are never usage properties.
