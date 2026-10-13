# Kortyx usage telemetry

Maintainer usage telemetry measures adoption and reliability of the SDK and OSS Studio. It is separate from customer observability in `@kortyx/telemetry` and `@kortyx/otel`. The default destination is Kortyx's EU PostHog Production project, using its public capture key. Consumers need no personal API token.

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
| `KORTYX_USAGE_TELEMETRY_ID` | Optional random UUID for deliberate identity sharing between Node processes |

Tests (`NODE_ENV=test`) disable the default Node integration. Consumer `NODE_ENV` and `CI` supply a coarse runtime mode; they do not select the maintainer project. Browser bootstrap receives only public configuration from Studio's server environment, so no `NEXT_PUBLIC_` variables are needed. Debug output contains approved dimensions and aggregate counts, never application payloads.

Node delivery lazily stores a random installation UUID in `~/.config/kortyx/usage-id` (new directory mode 0700, file 0600). Read-only installations use a process UUID instead. Removing the file resets the identity after restarting the process. Browsers lazily store a separate random UUID in local storage at `kortyx.usage.id`, falling back to an in-memory UUID if storage is unavailable. Clear this key and reload to reset it. Browser/server identities are independent; they do not establish a cross-product funnel. These are pseudonymous identifiers, not people or authenticated accounts.

## Approved data and bounded delivery

The shared catalog allows fixed operation names, outcome enums, Kortyx release versions, provider families, storage/transport kinds, coarse HTTP status, known error codes and booleans. Arbitrary property keys are dropped; unrecognized enum values and error codes become `other`. The error projection reads only own data properties and does not invoke application getters.

Prompts, inputs/outputs, messages, schemas, workflow/node/tool names, URLs, paths, custom application error codes, customer IDs, credentials, raw errors and stacks are excluded. Capture requests omit browser cookies and referrers, disable PostHog person profiles and geolocation enrichment, and send `$ip: null`. Network infrastructure still receives a request's source IP; the payload is not proof of legal anonymity. There is no autocapture, session replay or global exception handler.

Records aggregate matching operations, outcomes and approved dimensions over a 60-second flush window. A scope finishes once. Successes and failures use the same counting policy. `usage.operation` records reliability and duration; `usage.feature` records deliberate adoption or explicit feature configuration. Background reads/refreshes have separate origins and must not be used as click counts.

Each component client buffers at most 64 distinct groups and sends at most 120 groups per hour. A group can represent many attempts through `count`. Duration buckets are noncumulative: ≤10ms, (10,100], (100,1,000], (1,000,10,000], (10,000,60,000], >60,000ms. Query `duration_total_ms / count` for means or combine bucket counts for approximate distributions. Restrict latency queries to `usage.operation`.

Delivery is best effort, single-flight, with a two-second transport timeout, no retries and unreferenced Node timers. SDK operations never await analytics delivery or change results because collection fails. The short-lived Studio setup CLI flushes after recording its outcome, so it can spend up to the transport timeout delivering its final batch. Browser visibility changes request a flush. Offline, disabled, terminated or short-lived processes can lose records; call the helper's `flush()` explicitly at an application-controlled shutdown boundary when appropriate. No disk event queue or crash detection is implied. `stats()` exposes local pending/dropped/delivered group counts. Budgets are per component and process, not an organization-wide spending guarantee; PostHog's $0 billing limits remain the financial control.

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

Studio boundaries include CLI setup, API requests/ingest, server reads and parse failures, first-use guidance and observed data, navigation, tab/trace inspection, render failures/retries, prompt actions, eval launch/read/cancel and live refresh/reconnect. Prompt and eval browser actions measure request acceptance; they do not imply background worker completion. Some preflight errors before a selected boundary remain outside this slice.

The [opportunity inventory](../../docs/audits/sdk-studio-usage-telemetry.md) covers remaining node/parallel/child execution, prompt cache/refresh, persistence internals, exporter queue loss, deeper filters/saved views, worker completion, reviews and upgrade phases. Reserved catalog operations are not evidence that these boundaries already emit. Feature-flag evaluation and exposure are a future addition.

Use `sum(properties.count)`, rather than raw PostHog event count, to measure attempts. For a comparable component/operation cohort, failure rate is `sum(count where outcome = failed) / sum(count for completed operation outcomes)`. Decide explicitly whether cancellations, denial and suspension belong in the denominator. Compare installation reach, repeated use and failure rate by release; do not rank features solely by workload volume. PostHog funnels over aggregates give coarse observed ordering (flush windows can obscure exact ordering), not exact user-session sequences or time since npm installation.

## Proposal: replace direct capture with a Kortyx collector

Keep direct EU capture for this slice. A later collector can accept the existing versioned record envelope, validate the catalog again, cap body/group/count sizes, rate-limit installations and total daily ingestion, deduplicate `event_id`, strip network metadata, and route approved releases to the intended PostHog project. Keep retention and operational logs bounded and avoid logging request bodies. Forward asynchronously with its own retry/deduplication policy.

This moves abuse controls and global budgets to an owned boundary: a public PostHog capture key can be copied and spoofed, so client caps alone cannot protect ingestion or establish authenticity. Replace the transport or set `KORTYX_USAGE_TELEMETRY_ENDPOINT`; product instrumentation does not change. Endpoint deployment, global limits and project routing belong to that follow-up. Existing released SDK versions continue direct capture until upgraded, so migration must account for them.
