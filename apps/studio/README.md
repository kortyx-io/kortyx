# Kortyx Studio

Evaluation tables and comparison overviews load compact comparison snapshots in
the background. PostgreSQL selects status, costs, and SHA-256 context fingerprints
without transferring transcripts, progress events, or judge evidence to Studio.
Lightweight status refreshes are coalesced; comparisons reload on completion or
explicit refresh. Snapshot reads have cardinality and 2 MiB response limits,
two admitted requests per process, and a two-entry request-local cache. Overload
returns an explicit unavailable state instead of retaining an unbounded queue.
Completed Changes cells are cached across page loads for up to 30 minutes in a
process-local LRU capped at 128 comparisons and 8 MiB of serialized cells. Keys
include both result versions, API credentials, project/environment selection and
sample mode. Changing a baseline or result version causes a miss; failures are
never cached. History and authorization are still checked for every request.
Cache entries contain only derived comparison cells, never reports or snapshots;
restarts and separate Studio replicas may recompute a bounded cold read.

Kortyx Studio is the source-available Studio shell for the Kortyx plugin ecosystem.

## License

This app is licensed under the Elastic License 2.0. See `LICENSE.md`.

## Local updates

The updater preserves the installation owner's UID/GID on private state,
configuration, and backups. On Linux, the regular installer user can continue
using the CLI after the Docker updater checks or installs a release. State
directories remain private (0700), and written files remain private (0600).

## Development

Signed-in account shells check session validity once a minute, including in
background tabs, so login can be ready before the user returns. They also check
when a tab regains focus, becomes visible, resumes from freezing, returns from
the back/forward cache, reconnects to the network, or receives a denied Studio
data request. The auth adapter's optional `getSessionStatus` inspects the session
without starting login or updating foreground activity. When it reports an expired
session, Studio reloads the current URL so the configured auth adapter handles
sign-in and the return destination. Permission
denials and offline failures keep their existing error behavior. These checks
also run while live data refresh is paused; browser background throttling may
delay an idle check until the tab becomes active again.

```bash
pnpm dev
```

This starts Postgres, the Kortyx API, Studio, and the canvas example for local
development. By default, Studio runs on `http://localhost:6300`.

If you already manage Postgres yourself, run:

```bash
pnpm dev:no-db
```

## Drawer-stack browser regression tests

Studio uses Playwright to protect the intercepting-route detail architecture
covered by KTX-25. The suite exercises the real Studio and telemetry API rather
than mocking drawer components.

Prepare the local database once, then run the suite from the repository root:

```bash
pnpm dev:setup
pnpm test:studio:e2e
```

The command builds the workspace packages needed by the API, starts or reuses
the API and Studio development servers, and runs Chromium. The setup project
sends deterministic `e2e-ktx25-*` telemetry through the ingestion API. Its
teardown project deletes only that scoped fixture from raw telemetry,
projections, and its workflow revision—even after browser-test failures.

The scenarios cover:

- one entry animation across loading and resolved content;
- Session → Run → Trace/Event stacking and ancestor clicks;
- one-layer backdrop, Browser Back, and Browser Forward transitions;
- same-path tab/selection history without close–reopen regressions;
- immediate tab content with an animated inspector exit;
- Interrupt → Run navigation;
- expanded Run geometry, backdrop release, and sidebar access;
- hard-refresh rendering for Session, Run, and Interrupt routes.

Playwright records traces, screenshots, and video only on failures. Reports are
written to `apps/studio/playwright-report`; raw artifacts are under
`apps/studio/test-results`. Tests use web-first assertions and shared motion
state instead of fixed sleeps.

For an interactive runner:

```bash
pnpm --filter kortyx-studio test:e2e:ui
```

Also run drawer navigation against a production build, where Next.js enables
automatic link prefetching. Use a free Studio port; this mode builds and starts
its own server so it cannot accidentally reuse a development server:

```bash
KORTYX_E2E_PRODUCTION=1 KORTYX_E2E_STUDIO_URL=http://localhost:6301 pnpm --filter kortyx-studio test:e2e detail-drawer-stack.spec.ts
```

## Self-hosted authentication

Kortyx Studio uses a small auth-mode boundary so the self-hosted preview can
stay simple while the managed Cloud Studio can plug in enterprise auth later.

Supported self-hosted modes:

- `none`: disables Studio human auth. This is the default in development.
- `basic`: protects Studio with HTTP Basic Auth. This is the default in
  production.
- `cloud`: reserved for the private managed Studio build. The self-hosted build
  returns a clear error if this mode is selected.

Example self-hosted configuration:

```bash
KORTYX_STUDIO_AUTH_MODE=basic
KORTYX_STUDIO_BASIC_AUTH_USERNAME=admin
KORTYX_STUDIO_BASIC_AUTH_PASSWORD=change-me
```

In production, Basic Auth fails closed if username or password is missing.
Deploy Basic Auth behind HTTPS or a trusted reverse proxy; Basic Auth credentials
are only base64 encoded on the wire.

## Studio API access

The browser authenticates to Studio with Basic Auth. Studio itself reads
telemetry through the Kortyx API using a server-only API key:

```bash
KORTYX_API_URL=http://localhost:6400
KORTYX_STUDIO_API_KEY=ktyx_test_replace_with_bootstrap_studio_read_key
```

`KORTYX_STUDIO_API_KEY` must never be exposed to the browser. The Studio API
client is server-only and should only be imported by server components, route
handlers, or server actions.

The Settings route and sidebar identity use the authenticated
`/v1/studio/context` endpoint. The preview presents one local scope, its
bootstrapped project, observed telemetry environments, API-key mode/scopes, and
API service version. It never returns the read key, key identifier, API URL,
Basic Auth credentials, or raw upstream errors. Settings reports server
configuration as configured/missing and masks the read-key value.

The self-hosted identity menu intentionally contains no account, billing, upgrade,
notification, logout, or other managed-SaaS placeholders. Its supported actions
are Settings, public documentation, and theme selection. Under HTTP Basic Auth,
credential lifecycle belongs to the browser/reverse proxy rather than an
in-app logout control.

Telemetry content policy is producer-controlled: structural telemetry can be
observed without prompt/response content, content is excluded by default, and
the SDK must explicitly opt in. Studio displays this policy but never enables
capture itself.

The Runs, Sessions, and Interrupts Live controls use a same-origin SSE bridge.
Telemetry commits publish compact project-scoped invalidations; server
components then refresh the current route. This avoids fixed polling while
preserving server-side filtering and pagination. When the stream is unhealthy,
Studio uses a jittered 30–60 second fallback and stops it after reconnection.
See [Studio live refresh](../../docs/design-specs/studio-live-refresh.md) for
the security, scaling, failure, and test boundaries.

## Response feedback and reviews

Root executions have a Feedback column and an All/Positive/Negative/Unrated filter. Ratings
link directly to the existing run detail's Feedback tab. Session activity shows
the same badges. Both positive and negative counts remain visible if different
users disagree; a run can match both filters. Feedback never changes execution
status. Human correctness reviews are shown separately from end-user ratings.

The application's authenticated backend sends `POST /v1/telemetry/scores` with
`{ runId, actorId, value: 0 | 1, reasons?, comment? }`, using its server-only
`telemetry:write` key. Verify response ownership and derive `actorId` from the
authenticated application user before forwarding feedback. Never expose this
key in browser code. Re-rating updates the same score; `DELETE` on the same
endpoint with `{ runId, actorId }` clears that actor's vote. Runs must already be
ingested; a 404 can mean telemetry is still flushing. See the API's OpenAPI docs.

Reviews require a server-only Studio key with **both** `studio:read` and
`studio:write`. OSS bootstrap grants both scopes by default. Existing
installations should rerun bootstrap with their stored keys:

```bash
pnpm db:bootstrap
```

For a remote deployment, rerun its normal database bootstrap job with the same
keys and pepper. Bootstrap also grants prompt, diagnostic and eval permissions;
no OSS feature environment switches are required. Custom read-only keys still
remain read-only unless explicitly reconfigured. Migrations alone do not grant
key permissions.
Review POST/DELETE requests go through Studio's authenticated same-origin
bridge, never directly from the browser with the API key. The API derives
review identity from its authenticated Studio key. Shared installations share
one reviewer identity per key, not per-person cloud identity.

Scores live in their own tenant-scoped table, not workflow state or mutable
execution events. The schema supports boolean, categorical, and numeric values,
with end-user/reviewer/evaluator provenance. This release implements feedback
and human review only, not an evaluation runner or automatic Langfuse forwarding.
Comments are deliberate user submissions: apply your retention/privacy policy
and avoid copying sensitive response content into them. Score deletion cascades
with the retained run/project. Run and session Live refresh invalidations fire
only after committed score changes.

Run `feedback.spec.ts` for the real API/drawer regression test. It verifies
write/edit/clear with a review-capable key and the disabled/read-only state with
a read-only key; run both configurations when changing permissions.

## Time-range contract

Runs, Sessions, Interrupts, and Workflows share the same server-side time
filter contract: Last hour, 24 hours, 7 days, 30 days, All time, or Custom
range. Relative presets are resolved against the API request time. Custom
ranges are complete absolute ISO timestamps with an explicit offset; the
Studio calendar selects full UTC days and writes normalized `Z` timestamps to
the URL. Missing, reversed, invalid, or timezone-ambiguous custom boundaries
return a visible `400` error instead of silently widening the query.

Workflow metric responses include the absolute cohort boundaries used by the
server. Inspector “View runs” links convert those boundaries to an exact custom
range, and preserve the workflow, version, node, or transition filter, so the
run list represents the same population even as wall-clock time advances.

## Self-hosted preview

The canonical installation path from any Kortyx SDK project is:

```bash
npx kortyx studio start
```

The command generates the Basic Auth password and scoped API keys; no shared
default password is shipped. See the
[self-hosted preview guide](../../docs/studio/self-hosted-preview.md) for the
SDK connection and first-run verification, and the
[self-hosted operations guide](../../docs/studio/self-hosted-operations.md) for
backup/restore, upgrades, reset, security, and troubleshooting.
For a deployment with managed PostgreSQL, use the
[server deployment guide](../../docs/studio/deploy-on-server.md) and its
[portable deployment contract](../../docs/studio/deployment-contract.md).

From the repository root for local development:

```bash
cp -n .env.example .env
docker compose up --build
```

To verify the stack with one deterministic telemetry run:

```bash
docker compose --profile smoke up --abort-on-container-exit --exit-code-from smoke smoke
```

The smoke command sends one workflow topology and one successful run through the
Kortyx API, then verifies that `/v1/studio/runs` can read it back.

## Self-hosted image release flow

For installed instances, see [Studio updates](../../docs/studio/updates.md) for
the Settings controls, optional daily updates, backups, and manual recovery.

Self-hosted Studio images are published separately from the website through the
manual **Publish Release (Studio)** GitHub Actions workflow.
First complete **Publish Release (NPM Packages)** for the release commit. Then
run the Studio workflow from `main`, supplying the existing `studio-vX.Y.Z` tag
in `release_tag`. Creating the tag alone does not publish Docker images.

The workflow builds native `linux/amd64` and `linux/arm64` manifests and pushes:

```txt
ghcr.io/kortyx-io/kortyx-api:staging-latest
ghcr.io/kortyx-io/kortyx-api:staging-vX.Y.Z
ghcr.io/kortyx-io/kortyx-studio:staging-latest
ghcr.io/kortyx-io/kortyx-studio:staging-vX.Y.Z
```

It then installs the packed CLI in an empty directory and tests the staged
images on native AMD64 and ARM64 GitHub runners. Both jobs must pass health,
telemetry read/write, restart persistence, credential stability, documented
lifecycle commands, and database backup/restore checks.

The final job is protected by the `studio-production` GitHub environment.
After manual approval, it promotes the exact tested image-index digests—without
rebuilding—to:

```txt
ghcr.io/kortyx-io/kortyx-api:vX.Y.Z
ghcr.io/kortyx-io/kortyx-api:latest
ghcr.io/kortyx-io/kortyx-studio:vX.Y.Z
ghcr.io/kortyx-io/kortyx-studio:latest
```

Release-please creates the immutable `studio-vX.Y.Z` Git tag before publication.
Repository setup and release/recovery instructions are in the
[Studio self-hosted release runbook](../../docs/design-specs/studio-oss-release.md).

## Table filters and views

`DataTable` is the single entry point; callers do not wrap it in a provider or
wire individual search/sort/pagination/layout callbacks:

```tsx
<DataTable
  tableId="example-items"
  columns={columns}
  data={items}
  getRowKey={(item) => item.id}
  onRowClick={openItem}
/>
```

Declare each column's `filter` (`key`, `label`, `kind`, `read`, optional `options`,
`optionLabels`, `unit`, `group` and `order`), or explicitly use `filter: false` for
actions/selection. Composite columns can declare several filters. Table-level
`filters` add fields without a displayed column. `sortKey` enables sorting;
`sortValue` overrides the default raw reader when needed. Keep feature formatting,
row actions and API fetching in the feature.

Local tables automatically search, filter, sort and page the supplied dataset.
For API-backed tables, pass `query={{ mode: "remote", defaults: { sort: "started" } }}`
and `totalCount`; the feature's server read interprets the shared URL query and
returns the requested page. `query.keys` preserves existing/nested URL bindings,
and `query.pageSizes` declares endpoint limits (operational lists retain 250 rows;
other tables default to 10/20/50/100). Use stable table IDs to keep preferences
isolated. No special-case table IDs belong in the shared components.

`scopeFilters` describes independent request controls (`text`, `enum`, `boolean`,
or `timeRange` with explicit bound keys); their rendering, reset and saved-view
behavior are shared too. `filterResource` enables authorized API suggestions for
supported resources. `compatibility` supplies legacy URL readers/aliases, and
`legacyViews` supplies one-time migration data. These adapters live in features;
the table does not know their cookie names or business rules. An `emptyState`
render function receives `hasFilters` and `clearFilters` to reset search, conditions and scope
through the same shared state owner.


Every Studio data table provides **Filters**, **Columns**, and **Views**, in that
order. Search remains in the toolbar; field filters, feedback, time range,
environment and archived-prompt controls live in the Filters drawer. Selection
and action columns have no filter; composite data columns expose their individual
facts (for example, workflow/version, model/provider and evaluation result counts).

Every table renders one shared toolbar: search beside Filters, Columns and Views.
Search stays outside Match any, so OR cannot bypass it. Server lists search before
counting/pagination; local tables search all declared data fields, including hidden
columns, before paging. Local detail searches use `tableSearch.<tableId>` so they
do not replace a parent list's `q`; existing list and prompt-linked search URLs
remain supported. Search is captured by saved views and survives refresh.

The shared footer is always present: matching row count, rows per page, current
page and Previous/Next. Local tables default to 20 rows and keep their own
`tablePage.<tableId>` / `tablePageSize.<tableId>` URL state. Search/filter changes
reset paging. Prompt-library pagination uses the API's bounded `limit` parameter
(1–200; omitted callers retain the existing 100-row default); Studio offers
10/20/50/100 and defaults to 20. Prompt selection and its batch actions live at
the left of the toolbar; Select all shows empty, partial or checked page selection
and toggles that page without a separate Clear selection action.

Every table uses the same inline filter drawer, generated from its field definitions.
Choose values without adding conditions: enums use checkboxes, text uses autocomplete,
and numeric/date fields show minimum/maximum inputs. Changes apply automatically
(text and ranges wait 350 ms after typing); the drawer stays open. Every drawer
provides filter search, optional definition-owned groups, and Select all for enums.
Per-field options expose negative/missing-value matches. Clear filters resets field
conditions and configured scope fields while preserving search; Standard view also
resets search, sorting, page size and column layout.

Choose **Match all · AND** or **Match any · OR** for the populated fields. Multiple
values within one condition match any of those values. Project, authorized
environment, time range, category and search restrict the dataset independently
of OR. Nested groups are not supported.

Text supports case-insensitive Contains/Does not contain and exact matches, with
existing-value autocomplete. Suggestions search the scoped dataset, including
rows beyond the current page, and return up to 50 distinct values. Free text is
still accepted when suggestions are unavailable. Numeric/date fields support
comparisons and inclusive ranges; dates use explicit UTC timestamps. Boolean
fields use true/false. Has a value/Has no value distinguish missing evidence from
zero or false. Negative conditions require a recorded value. Numeric cost
filters compare the displayed known subtotal; mixed currencies without a single
amount are missing, rather than implicitly converted.

Custom time range opens the calendar, including when no custom range has been
applied yet. Apply range writes UTC bounds to the URL. Filter conditions also
live in the URL (`tableFilters` for server lists, `tableFilters.<tableId>` for
embedded tables), so refresh and Back/Forward restore them. Invalid conditions
show a resettable error or an API validation error instead of being ignored.
The request limits are 32 conditions, 30 values per condition, 512 characters per
value, and 32 KiB of serialized conditions.

Text filter suggestions use the shared shadcn Combobox, with keyboard navigation,
selection styling and free-text entry. Server suggestions retain the authorized
scope and the existing request limits.

Top-level Runs, Sessions, Interrupts, Prompts and Evals lists share
`TablePageHeader`: title/description on the left, page actions on the right,
followed by the standard table toolbar. Evals Runs/Suites navigation is a compact
segmented link group after the workspace breadcrumbs, including on detail routes;
it preserves project routing and the selected environment without a separate tab row.
Prompts retains its centered compact Categories side rail and category drawer,
with the full category tree beside the table on wide screens. Test groups use a flat, edge-to-edge table
with a compact drawer header and the shared list header in expanded and direct routes.
The drawer header contains the page action beside its expand/close controls.

Row hover belongs to `DataTable`, including non-clickable rows. Every cell uses
the same opaque row background so left/right pinned columns stay synchronized
and cover scrolled content. Return `"danger"` from the `rowTone` callback for
failure tinting rather than setting separate pinned-cell backgrounds.

All columns are visible by default, and Reset layout shows every column again.
Saved layouts retain known column order/visibility and append new visible columns. The Columns chooser uses the same effective
order as the headers, with hidden columns retained at their configured positions.
Both headers and chooser rows support dragging; the chooser also has keyboard
sorting and one-step move buttons. Pinning groups columns left/center/right.
Dropping into a different group adopts its pin state, including when the dragged
column is the sole pin. Layout, sort and page-size preferences persist through the
shared database/cache provider. The scoped browser cache hydrates after server
rendering and refreshes from PostgreSQL in the background without blocking the
page. Self-hosted preferences belong to the project; cloud preferences belong to
the authenticated user within a project. Unauthenticated development mode remains
browser-local. Saved views capture search, filters, configured scope, sort, page
size and unstretched column widths. Existing URL aliases remain supported.
See [Table preferences and saved views](../../docs/studio/table-preferences.md)
for ownership, conflict recovery, cache behavior, rollout and migration contracts.
Scrollbars overlay the table using the shared ScrollBar UI, without reserving a
gutter or adding header spacing. Header/body scrolling stays synchronized during
a held column drag. Dragged
headers and cells share their movement, remain above pinned columns, and support
Escape to cancel. Horizontal wheel gestures over the header scroll the body as
the shared owner, avoiding opposing scroll updates.

Runs includes User ID and Tenant ID. Other added fields include completion/environment/pricing data,
session models/providers/tags, interrupt resolution timestamps, prompt assignments,
and evaluation judge/pass-rate/queue/case/comparison metrics. Missing evidence is
shown as a dash. Comparison deltas use per-attempt means and require comparable
evidence; cost deltas also require complete costs in one shared currency.

Use Views to restore, rename or delete a view, or save the current configuration.
Up to 30 views per owner/project/table are retained. Database-backed preferences
are available across browsers; unsaved changes stay in the originating browser
until acknowledged. Existing unscoped browser views are not imported.

Runs, sessions, interrupts and prompt-library filters apply before server counts
and pagination. Evaluation summaries scan history in batches before counting and
paginating, including evaluations older than the former 100-row window. This
computed-summary scan grows with history size. The suite catalog resolves the
latest run per suite across history. Prompt-linked tables load all scoped linked
runs/evaluations, then filter and paginate locally; large histories can therefore
increase response size. There is no silent 100/200-row filter cutoff.

Filter usage records each applied field/search change (debounced for typed values) and
the allowlisted `all`/`any` choice through the shared usage helper. It measures UI
intent, not query success;
no condition values or view names are collected. Existing usage opt-out and
bounded delivery behavior apply.

Ship the API and shared contracts/database packages before the matching Studio
version. No database migration is required. Legacy filter URLs are accepted and
converted when filters are applied; the existing bounded history API remains
available for older consumers.

### Shared action buttons

All Studio actions use the shared `Button` variants. `primary` is the filled
main action (New prompt, Save, Run evaluations); `secondary` is the outlined
supporting action (Import, Test groups, Cancel, Refresh); `ghost` is for
low-emphasis and icon actions; `destructive` is for destructive confirmation.
Inline text actions use the shared `link`/`inline` treatment. Navigation links,
menu options and data-row/disclosure controls keep their control semantics.

Page, drawer and table actions use `sm` (32px), forms default to 36px, compact
actions use `xs` (24px), and large actions use `lg` (40px). Icon equivalents
have the same heights. Action links use `Button asChild` so they retain normal
link navigation and the same size/style as button actions. Icon sizing and
pressed/disabled/focus states come from the primitive. Compound input buttons
also delegate to it; feature code supplies layout, not custom button styling.
The legacy shadcn `default`/`outline` aliases remain supported as
`primary`/`secondary` for existing consumers.

## Contextual help

Table header titles own their help tooltip; existing symbols own their explanations. Neither needs an extra question mark. Other compact page, drawer, metric and setting headers use help circles, aligned to the right in metric cards. All help cards use the same arrow and separate documentation footer. `OverlayArrow` supplies shared geometry for interactive help and compact tooltips; Radix handles side rotation and collision positioning. Its overlapping fill removes the border seam, and the panel drop shadow follows the complete shape. `HelpDefinition` requires a label, short description and a topic-specific documentation URL. Shared Studio topics live in `src/lib/studio-help.ts`; edition contributions pass their own relevant topic through the existing typed UI props.

`InfoTooltip` uses the existing non-modal Popover so the separate documentation footer can receive keyboard focus. Providing `documentationUrl` adds that footer; `trigger` supports existing symbols and numeric controls such as cost values. Set `triggerAction="preserve"` when the trigger already sorts or selects a view: its original action and pointer gestures still run, while hover/focus opens help and Tab reaches the footer. Pass `disabled` during active drags so help cannot intercept drag cancellation. `HelpCircle` consumes a complete definition. `DocumentationLink` is for roomy setup/empty/error states. Keep essential instructions visible and never nest help inside another button or input label.

Settings cards with an authored `help` definition also supply the current-page explanation and its documentation footer. This keeps edition-specific guidance with the contributing card. The planner reads authored metadata rather than account or record text, accepts public Kortyx documentation destinations, and highlights the compact card header; missing metadata retains shared guidance.

Prompt draft help explains server-acknowledged saves, local-only edits and explicit recovery. Essential keep-page-open/export instructions stay visible during a failed save. Only the API's known revision-conflict code with HTTP 409 receives the conflict label; connection or service failures remain “Draft not saved.” Neither help nor export retries a write. Customer steps live in [Review and save](https://kortyx.io/docs/studio/v0/prompts#review-and-save).

Verify hover-to-card movement, keyboard access to the footer, Escape/outside dismissal, narrow-screen placement and surrounding drawer behavior. Every destination must resolve to a page/anchor in the supported docs line. See [the audit](../../docs/audits/studio-contextual-help.md) and [completion policy](../../docs/internal/definition-of-done.md).

### Evaluation results workspace

Evals → Runs opens All conversations in one DataTable across suites. Selecting
a suite filters the same table while retaining its columns, search, and filters.
Cases with the same ID in different suites stay separate. Run totals use the
shared Runs metric layout; cost breakdown stays in the total-cost tooltip.
Results use one row per conversation across repetitions; open a
row in the platform drawer and choose a Repetition to read its input, answer,
assessment, execution links, and cost. Repetitions execute all selected cases N
times, including passes. Suite details shows a compact saved-definition summary and execution settings in a platform drawer; the conversation table stays visible.
The run list Changes column shows clickable groups and a right-side comparison
icon with an Open comparison tooltip. A named earlier completed run is chosen
independently of table filters. Inside a run, Comparison baseline changes that reference;
the Change column opens the same wide comparison modal for a case. Previous/Next
review the selected group; from a conversation row they follow the table’s suite,
search, filters and sort order across pages. Left/Right keys navigate unless a
menu or editor owns focus. Evaluation/conversation/baseline/group and independent
repetition selections use nuqs URL state with pushed history, so reload, shared
URLs and browser Back/Forward restore the view. Closing clears only modal state.
Comparison notes live in the change-status popover; load failures keep a visible
retry. The modal also offers Comparison baseline and stats that follow each selected repetition: outcome, execution time and total cost (with workflow/judge breakdown on the amount). See more stats expands from the thin gray footer attached to the summary boxes on both sides together. It shows the selected repetition’s details, then All repetitions totals and averages below a separator. Only the aggregates stay fixed when changing the dropdown. This run shows directional deltas; when repetition counts differ, totals/count indicators are hidden and per-repetition means show performance changes. Changing its baseline keeps the selected case and leaves the table baseline unchanged. Close restores the table. No row selection or extra
row height is required. Reference candidates come from the recent 100-run history.
Comparison matches suite/case identities and withholds deltas when context or
grading is incomplete. Cost totals include all repetitions; mean cost change
requires fully priced comparable results in the same currency. Existing suite
and conversation URLs remain readable as standalone pages.


### Browse definitions and inspect evidence

Evals → Suites opens a suite workspace with a searchable conversation table.
Select one conversation to inspect its current definition in a platform drawer;
the step selector and Previous/Next controls keep the table context. Suite and
conversation IDs remain shareable, including the selected definition step.
The Conversation ID appears under the title. The message comes before Expected
behavior, which groups configured criteria and automatic checks without verdict
badges. Judge instructions stays with the case context below; Case definition
shows only the selected case. **View workflow** opens topology with the configured
workflow selected, beside Judge instructions. Test data and reference facts remain optional.

Inside a saved run, Suite details describes the saved snapshot and execution
settings; additional identifiers and configuration are collapsed. Conversation
results lead with selected repetition outcome, execution time and cost, then the
recorded assessment and messages. One **Assessment details** expander groups the
criterion, supporting evidence and automatic check results without nested accordions.
The explanation stays visible; failed steps open their details by default. Missing
verdicts remain Not assessed. Raw response context expands separately. See more stats expands from a thin gray footer attached to the summary boxes. This repetition’s stats appear first, with All repetitions totals below a separator. The Conversation ID appears beneath the title; phase timings live in the stats instead of a separate Execution details section. Comparison uses
the same reading order: a shared step selector aligns Earlier and This run
assessments and messages, while repetition selections remain independent.
Step selection, baseline and repetitions survive reload and browser history.
