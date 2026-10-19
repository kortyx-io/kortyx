# Studio Local Development

Use this reference when the task is to launch Kortyx Studio locally, connect an
SDK application, publish its workflow catalog, or diagnose why Studio is empty.

## Mental Model

- Studio observes Kortyx applications. Its optional Evals control plane can ask
  a consumer endpoint to execute a suite; workflows still run in the application.
- The local CLI starts Studio, the telemetry API, and PostgreSQL in Docker.
- **Workflows** shows the declared catalog. **Runs** shows actual executions.
- Publishing a catalog must not create a fake workflow or run.

For suite execution, application service keys, judge models and eval scopes,
read [Studio evals and CI](studio-evals-and-ci.md). Telemetry configuration and
catalog publication alone do not enable eval execution.

## Consumer Project Flow

1. Confirm Docker is running, then start or reuse the local stack:

   ```bash
   npx kortyx studio start
   ```

2. Print copyable SDK variables with a stable service name:

   ```bash
   npx kortyx studio credentials --format dotenv --service-name my-agent
   ```

3. Put the four `KORTYX_TELEMETRY_*` values in the application's server-only
   environment. Never use `NEXT_PUBLIC_`, `VITE_`, or another public prefix.

4. Install `@kortyx/telemetry`, create one
   `createKortyxTelemetryAdapter(...)`, and attach it where the server creates
   the agent. Follow the current official guide at
   `https://kortyx.io/docs/studio/connect-project` for the adapter shape and
   content-capture policy.

5. Publish topology from the module exporting the agent, workflows array, or
   workflow definitions:

   ```bash
   npx kortyx topology push --entry src/lib/agent.ts
   ```

   Use `--dry-run` first when the entry/export is uncertain. `topology push` is
   the canonical pre-traffic catalog path; runtime registration remains a
   best-effort fallback for real executions.

6. Restart the app, send a real request that runs the agent, and inspect Studio.
   Confirm the catalog in **Workflows** and the execution in **Runs**.

After upgrading SDK and CLI versions, rebuild the application and republish its
source catalog. Verify declared links remain visible after executing the production
bundle, including unexercised targets. Topology identity excludes inferred handoffs
because bundling can hide their source targets. This correction can create one
new revision for previously inferred handoffs; historical run references remain
readable without a database migration.

## Kortyx Repository Flow

From the repository root:

```bash
pnpm install
pnpm dev
```

This prepares workspace packages and starts PostgreSQL, the API, Studio, and the
Canvas example. By default Studio is at `http://localhost:6300` and Canvas is at
`http://localhost:4200` (or the configured `KORTYX_CANVAS_PORT`).

Publish the Canvas catalog through its repository script:

```bash
pnpm --filter @kortyx/example-canvas topology:push
```

Then send a real Canvas request. Do not add or invoke a synthetic smoke workflow
to make Studio look connected.

## Child Workflow Visibility

Register parent and child definitions in the catalog. The CLI discovers resolvable calls from node/custom-hook source; dynamic targets are added through runtime observations. No call declarations are required. In **Runs**, enable **Include child workflows** to search individual calls, then open a child row to its parent execution's **Execution** tab. This view shows nested calls, node/generation ownership, lifecycle, captured input/returned data, and branch selection. Child rows do not increase session root-run counts.

Source-discovered calls appear as dotted purple call/return links even before traffic. **Observed calls** is enabled by default and overlays recorded metrics plus dynamic targets. Turning it off keeps source-discovered links visible. Click a link to open a concrete call. The map legend distinguishes these purple dotted calls (return to caller) from blue dashed `transitionTo` handoffs (transfer execution). In the Canvas example, send `/help` to exercise the handoff to `canvas-help` alongside the existing child-call paths. Publish the catalog before running real application traffic; an absent source link should be checked with `topology push --dry-run --json` and its discovery warnings; an absent observed link means no call was captured in the selected cohort.

For fork/rollback testing, compare `(runId, branchId, invocationId)`, not invocation ID alone. Restored calls reference source evidence, completed results can be reused without new execution, and leaf human interrupts link back to the call tree. Input/output capture is opt-in; oversized child payloads are omitted with a marker. Old SDK generic spans cannot establish logical completion.

## Troubleshooting Order

OSS Studio also collects maintainer usage aggregates by default, independently of
customer traces. To opt out, set `KORTYX_USAGE_TELEMETRY_DISABLED=1` (or `true`) on
the CLI process and both API/Studio services. CLI-generated Compose forwards this
control; restart containers after changing their environment. Studio's server
passes public configuration to the browser, so no `NEXT_PUBLIC_` variable is
needed. `KORTYX_USAGE_TELEMETRY_DEBUG=1` previews approved aggregates locally
without requests or identity creation. See
[observability-otel.md](observability-otel.md#placement) for the data boundary and
destination controls; do not confuse the public PostHog capture key with secret
Studio read/write credentials.

1. Run `npx kortyx studio status`.
2. Run `npx kortyx studio logs --no-follow`.
3. Reprint credentials and compare the API URL/key with the server process.
4. Confirm the app restarted after environment changes.
5. Dry-run and then publish the correct agent entry.
6. Check **Workflows** for the catalog and **Runs** for a real execution; do not
   expect catalog publication alone to create a run.

Use `npx kortyx studio credentials` for browser sign-in details. Treat every
printed telemetry key as a secret.


### Error diagnostics

The native `createKortyxTelemetryAdapter` captures complete credential-redacted
error diagnostics by default. OSS bootstrap grants the Studio key diagnostic,
review, prompt and eval permissions without feature environment switches. Upgrade
API/Studio and migrate first, then rerun bootstrap with stored keys and pepper
before upgrading the SDK. Set `diagnostics: { enabled: false }` on the native
adapter to disable complete capture and uploads while keeping bounded error
events. Retention defaults to 30 days and the project budget to 256 MiB; override
`KORTYX_DIAGNOSTIC_RETENTION_DAYS` / `KORTYX_DIAGNOSTIC_PROJECT_BYTES` explicitly
on the API if needed. Prompt content and normal input/output capture remain opt-in.

With tracing configured, thrown workflow/model errors automatically export bounded type/message/stack/cause diagnostics without additional call-site wiring. Studio's failed model request inspector shows provider diagnostics; a separate **Model reasoning** row shows JSON/schema processing failures after an otherwise normally completed model response. Failed provider requests do not add a duplicate reasoning-failure row. Interrupts and cancellation retain their control-flow treatment.

Use `reportError(error, {severity?, metadata?, tags?})` for handled errors when execution deliberately continues. Bounded event/OTel error summaries retain type up to 256 characters, message up to 8192 and stack up to 32768. The native Studio adapter additionally captures causes, custom fields and private provider failure responses in a separate redacted artifact (up to 8 MiB by default). Both `createKortyxTelemetryAdapter` and `createOpenTelemetryTraceAdapter` optionally accept `error(error)` returning a replacement projection or `null` to suppress diagnostics before export; a throwing override does not change execution. The native adapter records failed capture if its projection throws. Tool diagnostics use the optional tool `telemetry.error` override. Client-facing `serializeFailure` and execution failure contracts remain unchanged; tracing diagnostics are for access-controlled Studio/internal logs.

## Exploring Studio before connecting an application

Customer instructions: `https://kortyx.io/docs/studio/sample-project` covers
sample selection, read-only boundaries, tours, current-page help and visibility.

Studio's project selector includes a read-only Sample project with fictional
execution history, prompts, and a saved evaluation. Hide or restore it under
Settings → Sample project. Sample URLs use `/sample/` and cannot edit resources,
launch evaluations, or resume approvals. Sample browsing requires no provider
credentials or application connection.

Sample records are not evidence of a real SDK integration. Complete the normal
workflow catalog publication and real-request telemetry verification in this
reference before calling an application connected.

Use **Explore → Explore Studio** in the navbar or **Help & tours** in the Studio/account
menu for independent chapters or the full walkthrough. The full tour covers
orientation, debugging, sessions/workflows, approvals, prompt versions, and saved
evaluation comparisons. Optional guides cover full error diagnostics, evaluations
still grading, and personalization. These do not extend the six-chapter full tour. Next/Back navigate; Skip
chapter, Exit, and Resume let users learn at their own pace. Progress is versioned,
validated, and browser-local; nothing starts automatically after a reload. The
Explore menu also provides **Explain this page** and a link to the website docs.
Page help explains the current real or sample view in place, preserving the record,
tab, filters, and project. Detail help focuses on the selected evidence rather than
repeating generic tab controls. It is separate from sample chapter progress and remains
available in empty or unavailable views. With no visible records, opening a sample
example requires an explicit choice; showing a hidden sample is disclosed first.
An example's page-help completion is not verification of a real integration.

The sample includes a two-turn session and passing/failing saved eval results.
Tour completion is not SDK ingestion evidence. The real `/onboarding` route
provides setup guidance; verify a published workflow and a real request separately.

## Cloud and shared Studio guidance

For managed Cloud, follow `https://kortyx.io/docs/cloud/get-started`; obtain the project-scoped SDK write key from the selected workspace's Settings. `createKortyxTelemetryAdapter` defaults to `https://api.kortyx.io` when `endpoint` is omitted or `undefined`; Cloud applications do not need an endpoint variable. Upgrade the adapter before removing the endpoint from an older configuration. `kortyx topology push` uses the same Cloud URL by default, with `--api-url`, `KORTYX_TELEMETRY_API_URL`, and `KORTYX_API_URL` taking precedence in that order. Local and self-hosted Studio must still pass their telemetry API endpoint explicitly. The adapter reads its options, not environment variables directly. Do not apply local Docker or operator read-key instructions to Cloud. The telemetry adapter and content-capture controls remain application-server owned in both editions.

Runs, sessions, metrics, workflows, prompts, and evaluation inspection use shared Studio guides at `https://kortyx.io/docs/studio/v0/overview`. Cloud browser sessions, application execution sessions, application tenant IDs, and Studio projects are separate concepts. Configure Cloud evaluation endpoints/provider connections in Settings; self-hosted operators configure their API server. Studio help circles link to relevant versioned documentation.


Cloud account profile, email verification, passwords, passkeys, connected sign-in methods, and browser-session management are covered at `https://kortyx.io/docs/cloud/account`. Keep this personal account guidance separate from application identities and project API keys. Explain unfamiliar terms in plain language before linking to the guide.


Documentation entry points: SDK `/docs/sdk`, shared Studio `/docs/studio`, Cloud `/docs/cloud`, self-hosting `/docs/self-hosting`, and shared CLI `/docs/cli` on `https://kortyx.io`. Use `/docs/cli/topology` for Cloud/self-hosted workflow publication and `/docs/cli/connections` for supported API access. Cloud CLI login is not implemented; Cloud ingestion keys cannot authenticate Studio read, prompt-management, or connected evaluation commands. Older Studio documentation URLs and their moved headings remain supported.
