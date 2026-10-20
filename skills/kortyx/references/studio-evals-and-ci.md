# Studio eval execution, configuration and CI

Use this reference to register an application's eval endpoint, configure judging,
run suites from Studio/CLI, or enqueue a post-deployment suite. First wire the
consumer as described in [conversation evals](conversation-evals.md).

For first-time integration or deployment, start with
[eval-onboarding.md](eval-onboarding.md). It covers both the consumer and Studio;
configuring only Studio does not mount or enable the consumer route.

## Diagnose deployment wiring

```sh
kortyx studio evals doctor --connection staging --target catalog --suite catalog-smoke
kortyx studio evals doctor --connection staging --target catalog --judge app --json
```

This performs discovery GET only, with safe failure categories and actionable
remedies. It checks scopes, target selection/environment, authenticated manifest,
suite registration and advertised judge compatibility. It starts no workflows,
model calls or saved runs; a consumer GET wrapper may perform app-owned auth.
Exit 0 means configuration checks passed; exit 1 means at least one failed.
The connection's environment filter applies unless overridden. The consumer must
still complete a real suite to establish actor/tool/provider access and persistence.
An older API may supply only a generic unavailable result; doctor says so.

## Who does what

Studio browser/CLI → Studio API → leased worker → authenticated consumer eval
endpoint → existing agent → captured execution → selected judge → saved results.
The consumer executes the workflow and binds its test user's permissions. The
Studio worker persists progress/results in tenant-scoped PostgreSQL. The browser
never gets the test-user token, consumer service key or model provider key.

Three credentials have different purposes:

| Credential | Holder and purpose |
| --- | --- |
| Application eval service key | Consumer handler and Studio API target configuration; authorizes suite initiation, not domain tool access |
| Test actor identity/token | Consumer setup/execute; binds the actual application permission and data-access path |
| Studio project key | Studio server proxy or CLI; scoped to organization/project/environment, with `studio:read` and `eval:run` |

The SDK telemetry write key does not authorize eval execution. Studio's existing
`none` (local) or `basic` (deployed OSS) browser auth remains independent; this
feature does not require private cloud authentication or a new login system.

## Register the consumer on the API server

Create a private target configuration file, for example:

```json
[
  {
    "id": "catalog",
    "name": "Catalog agent",
    "organizationId": "YOUR-ORGANIZATION-UUID",
    "projectId": "YOUR-PROJECT-UUID",
    "environment": "development",
    "url": "https://consumer.example.com/api/evals",
    "serviceKey": "YOUR-APPLICATION-EVAL-SERVICE-KEY"
  }
]
```

Use actual Studio organization/project IDs, not arbitrary UUIDs. The service key
must equal the consumer's `createEvalRouteHandler` key and have at least 32
characters. `id` identifies the target in CLI/filtering; `name` is the displayed
application label in Studio. These fields come from configuration, not inferred
from workflow names or the test user's organization.

Set `KORTYX_EVAL_TARGETS_FILE` on the Studio API backend and restart it. The server
reads targets at startup. Alternatively supply inline `KORTYX_EVAL_TARGETS` JSON;
the file takes precedence. No targets means an empty discovery list. The browser
cannot register an arbitrary endpoint or supply a service key.

Require HTTPS for remote targets. Local development may explicitly set
`allowInsecureHttp: true`; do not embed URL credentials, query strings or fragments.
When the API runs in Docker, `localhost` is the API container. Use the actual
reachable consumer hostname (for example `host.docker.internal` on Docker Desktop)
and a consumer bind address reachable from Docker.

For Compose or a CLI-managed stack, mount the target file into the **API**
container and forward the setting in a private override; a host variable alone
does not create a container mount:

```yaml
services:
  api:
    environment:
      KORTYX_EVAL_TARGETS_FILE: /run/secrets/eval-targets.json
    volumes:
      - /absolute/private/eval-targets.json:/run/secrets/eval-targets.json:ro
```

## Enable project execution permission

Run migrations for the compatible release, then bootstrap the local Studio
project key. OSS bootstrap grants all Studio feature permissions by default.
From a Kortyx source checkout:

```sh
pnpm db:migrate
pnpm db:bootstrap
```

This grants `eval:run` to the existing Studio key without an environment flag.
Reuse the stored keys and pepper when rerunning; do not generate a different key
or modify a shared environment merely to enable local testing. In a packaged
deployment, rerun its normal bootstrap job on upgrade. Reading needs
`studio:read`; starting/cancelling also needs `eval:run` and an allowed project
environment. Runtime authorization checks remain enforced for custom keys and
deployment adapters. A registered target and configured judge are still required.

## Select and configure judging

Studio-triggered runs use the project judge default, or **Studio judge** when unset. A consumer `createEvalJudge`
makes **App judge** available as an explicit alternative. Configure the selected
location; missing configuration does not fall back silently. The API pins judge
ID/version/location and rejects stale selections. See the consumer reference
for per-step App grading versus post-execution Studio grading.

For an OpenRouter-compatible backend judge, put these values on the Studio API
service, never the browser or consumer:

```dotenv
KORTYX_EVAL_JUDGE_MODEL=openai/gpt-4o
KORTYX_EVAL_JUDGE_API_KEY=<private OpenRouter key>
KORTYX_EVAL_JUDGE_BASE_URL=https://openrouter.ai/api/v1
KORTYX_EVAL_JUDGE_API=chat-completions
KORTYX_EVAL_JUDGE_ID=studio/openrouter/openai/gpt-4o
# Optional; default is the current Kortyx grading rubric version:
# KORTYX_EVAL_JUDGE_VERSION=kortyx-rubric-v4
```

Use a model/provider route supporting structured JSON verdicts. Other compatible
endpoints must implement the selected API. A custom API host may supply any
`EvalJudge` to `createApiApp({ ..., evalJudge })` instead of the env-loaded adapter.
CLI-generated and OSS Compose stacks forward judge variables only to the API.
For a CLI-managed stack, keep private settings in `<studio-home>/.env` and restart
with `kortyx studio start --home <studio-home>`. Consumer target mounts still need
the private override above.

### Environment variables and ownership

| Variable | Owner | Meaning/default |
| --- | --- | --- |
| `KORTYX_EVAL_TARGETS_FILE` | Studio API | Private JSON target file; takes precedence over inline configuration |
| `KORTYX_EVAL_TARGETS` | Studio API | Inline JSON array fallback; defaults to `[]` |
| `KORTYX_EVAL_JUDGE_MODEL` | Studio API | Judge model identifier; unset disables Studio judging |
| `KORTYX_EVAL_JUDGE_API_KEY` | Studio API | Required provider key when the judge model is configured |
| `KORTYX_EVAL_JUDGE_BASE_URL` | Studio API | Optional HTTPS provider origin/path; defaults to the OpenAI provider endpoint |
| `KORTYX_EVAL_JUDGE_API` | Studio API | `responses` (default) or `chat-completions` |
| `KORTYX_EVAL_JUDGE_ID` | Studio API | Optional identity; defaults to `studio/openai/<model>` even for compatible endpoints, so set an explicit ID for a custom provider |
| `KORTYX_EVAL_JUDGE_VERSION` | Studio API | Optional rubric version; current default `kortyx-rubric-v4`; update when grading semantics change |
| `DATABASE_URL` | Studio API/bootstrap | Existing Studio PostgreSQL connection, separate from the app's domain DB |
| `KORTYX_API_KEY_PEPPER` | Studio API/bootstrap | Existing API key verification secret; preserve across bootstrap/restarts |
| `KORTYX_API_URL` | Studio server | Studio API URL reachable from that server/container, not the consumer endpoint |
| `KORTYX_STUDIO_API_KEY` | Studio server/bootstrap | Existing project key for the server proxy; must have execution scope |
| `KORTYX_STUDIO_AUTH_MODE` | Studio server | Existing OSS browser auth: local `none` or deployed `basic`; cloud auth is outside this guide |
| `KORTYX_STUDIO_BASIC_AUTH_USERNAME`, `KORTYX_STUDIO_BASIC_AUTH_PASSWORD` | Studio server | Existing browser credentials for `basic`; distinct from API/service keys |
| `EVAL_SERVICE_KEY` | Consumer | Application-chosen env name in the handler example; must match the target's service key; Kortyx does not read this env automatically |
| `OPENROUTER_API_KEY` | Consumer using App judge | Provider package key for `openrouter(...)`; does not configure Studio judge |
| App test-account variables | Consumer | Application-owned username/password, token or test identity configuration read by setup; no built-in Kortyx account env names |
| `KORTYX_CONNECTION` | CLI process | Optional named connection default; alternatively pass `--connection` |
| `KORTYX_DEPLOY_EVAL_KEY` | CI process | Example name holding a Studio project key passed via `--api-key-env`; not a special SDK env |

Restart the API after target/judge changes, rerun bootstrap after execution-scope
changes, and restart the consumer after its account/provider configuration changes.
Existing telemetry settings are separate: emitting eval tool evidence requires
`toolExecution.emit: true` in the workflow, not an environment variable.

### Optional direct SDK use of a Studio model

```ts
import { createEvals, createStudioEvalJudge } from "kortyx";

const judge = await createStudioEvalJudge({
  url: "https://api.example.com", // API origin, not the Studio browser URL.
  apiKey: process.env.KORTYX_DEPLOY_EVAL_KEY!,
  environment: "staging",
});
const evals = createEvals({ agent, suites, execute, judge });
const result = await evals.run({ suiteId: suites[0].id });
```

This discovers/pins the backend model via `/v1/studio/evals/judge`. It requires
`studio:read`, `eval:run` and environment access. For loopback-only HTTP testing,
explicitly set `allowInsecureHttp: true`. It is an advanced code-judge adapter;
ordinary Studio-triggered runs do not need it or give the consumer a Studio key.

## Browser and CLI operations

Open `/evals/suites`, choose an application/suite and run selected cases with the
chosen judge, repetitions and concurrency. `/evals/runs` stores history; suite,
run, case and comparison details have shareable routes and stacked drawers.
Inspect interaction type, emitted evidence, grade reasons, errors and judge
identity. `ungraded` means awaiting evaluation, not passed.

Comparisons select a saved run as **baseline** and compare it with the current
**candidate** by case ID and pass rate across repetitions. Changed definitions,
inputs/references, graders, targets or environments can make results not
comparable. Missing actor/data/prompt snapshots prevent a controlled experiment;
a recorded pass-rate difference does not establish what caused it. They do not
rerun either workflow or ask an LLM to rank two prose answers.

```sh
kortyx connections add staging \
  --api-url https://api.example.com \
  --studio-url https://studio.example.com \
  --api-key-env KORTYX_DEPLOY_EVAL_KEY --environment staging

kortyx studio evals suites list --connection staging --json
kortyx studio evals suites get product-ambiguity \
  --target catalog --connection staging --include-content --json
kortyx studio evals runs start product-ambiguity \
  --target catalog --connection staging --case choose-blue \
  --repetitions 3 --concurrency 1 --judge studio --json
kortyx studio evals runs get RUN_UUID --connection staging --include-content --json
kortyx studio evals runs cancel RUN_UUID --connection staging --json
```

Local CLI stacks use `--connection local` and managed keys. Connection profiles
store key variable names, not raw remote keys. `--judge app` selects the code
judge. Repeat `--case` to select several; omit it for the full suite. The queued
API caps repetitions at 20, concurrency at 20, attempts per suite at 100 and total attempts at 1,000.
Enqueue returns immediately with a run ID, `queued` status and `studioUrl`; a
successful command means accepted, not passed. Do not retry POSTs automatically.
Cancellation is cooperative and does not roll back domain side effects.

Details omit captured content by default; `--include-content` reveals definitions,
observations and grading reasons with best-effort credential redaction. Run
history is the latest 100 project records before CLI environment filtering.

## Optional non-blocking post-deployment CI

Pin the compatible CLI/package in the app lockfile. After deployment and its
readiness check, enqueue once; no polling or release gate is needed:

```yaml
- name: Enqueue conversation evals
  continue-on-error: true
  env:
    KORTYX_DEPLOY_EVAL_KEY: ${{ secrets.KORTYX_DEPLOY_EVAL_KEY }}
  run: >-
    pnpm exec kortyx studio evals runs start product-ambiguity
    --target catalog --environment staging --judge studio
    --api-url https://api.example.com
    --api-key-env KORTYX_DEPLOY_EVAL_KEY --json
```

The key needs execution scope, the CI runner needs access to the Studio API,
and the API must reach the deployed consumer. Do not combine direct connection
flags with `--connection`/`KORTYX_CONNECTION`. Each invocation creates a run unless a matching `--idempotency-key` is reused;
the deployment workflow owns trigger frequency.

## Troubleshooting and source references

- No suites: check target file visibility inside the API container, matching
  tenant/project/environment, and authenticated consumer manifest discovery.
- Cannot run: verify project execution scope and rerun the intended bootstrap;
  browser login or a telemetry key alone does not grant it.
- Missing judge: configure the API-owned model or explicitly select App judge.
  A stale judge/suite revision requires refreshed discovery, not silent retry.
- Grounding fails: inspect emitted tool events; a missing result is not proof
  that no call occurred. Confirm actual test-user permissions and data.
- Provider error/invalid JSON: this is a grading error, not a behavioral failure;
  verify structured-output support and private backend logs.

Implementation paths in a matching Kortyx source checkout:

- `apps/api/src/evals/targets.ts`, `judge.ts`, `worker.ts`, `grade-execution.ts`:
  target/model loading, leased execution and post-execution grading.
- `apps/api/src/routes/evals.ts`, `eval-judge.ts`: scopes, discovery, enqueue,
  saved results, cancellation and explicit backend judge adapter.
- `packages/telemetry-db/src/repositories/evals.ts` and
  `drizzle/0005_eval_runs.sql`: tenant-scoped persistence and worker claims.
- `packages/telemetry-db/src/scripts/bootstrap-local.ts`: execution opt-in.
- `packages/agent/src/evals/studio-judge.ts`: direct SDK backend-judge adapter.
- `packages/cli/src/studio/eval-command.ts`, `eval-client.ts`, `compose.ts`:
  command flags, transport and container env forwarding.
- `packages/cli/src/evals/command.ts`, `environment.ts`, `reporter.ts`:
  local entry execution, env-file/profile loading and live terminal reporting.
- `apps/studio/src/features/evals/`: UI, API proxy, launch state and comparisons.
- `apps/api/test/evals.integration.test.ts`: CLI → API → worker → SDK consumer,
  persistence, scope isolation and cancellation regressions.
- `apps/studio/e2e/eval-navigation.spec.ts`: routes, drawer/history races,
  selected cases, comparison evidence and reload behavior.
- `.env.example`, `docker-compose.oss.yml`, `docs/evals/studio-execution.md` and
  `docs/evals/cli-and-ci.md`: full server/deployment configuration.

See the public [Studio eval guide](https://kortyx.io/docs/studio/evals) and
[configuration reference](https://kortyx.io/docs/studio/configuration-reference)
for the deployed version. This release does not add suite authoring, historical
session grading, saved-run regrading or prompt-version pinning in the browser.

## Run locally without Studio

Export the existing `createEvals` instance as `evals` (or the default export) from
an application module such as `src/evals/index.ts`. Use a dedicated eval module
that initializes the agent and suites without starting your HTTP server.
TypeScript and JavaScript entries use the CLI's existing module loader and nearest
`tsconfig.json` path aliases. The loader stays active for lazy workflow imports
until execution finishes. Keep initialization synchronous; do asynchronous
identity setup inside `createEvals.setup`.

Add a script to your application's `package.json`:

```json
{
  "scripts": {
    "eval": "kortyx evals run --entry ./src/evals/index.ts"
  }
}
```

```sh
pnpm eval
pnpm eval --suite product-ambiguity --case choose-blue --repetitions 3
pnpm exec kortyx evals list --entry ./src/evals/index.ts
pnpm eval --suite product-ambiguity --concurrency 2 --json > eval-results.json
```

The command calls the exported instance's `run()` directly. Your existing setup,
permission binding, custom executor, interrupt responders, cleanup and code judge
all run in the application process. No Studio, consumer HTTP endpoint, target
configuration or Studio key is required. Semantic criteria require a code judge;
interaction and structured-output checks alone require no judge. Workflow models,
tools and authentication still need their usual application configuration.

The CLI loads `.env` then overlays `.env.local` before importing the entry.
In a monorepo it loads defaults from the Git or pnpm workspace root down to the
app directory, with nearer files taking precedence. Existing shell variables
always win.
To select other files, repeat `--env`; later files override earlier ones:

```sh
pnpm eval --env /private/development.env --env /private/eval.env
```

For a one-line package script without repeated flags, remember paths in a
**gitignored** `.env.evals.json` in the app or workspace root:

```json
{
  "envFiles": ["/private/development.env", "/private/eval.env"]
}
```

Keep the profile and referenced files owner-only (`chmod 600`). Relative paths
in the profile resolve from its directory. The nearest profile replaces default
env loading; discovery stops at a Git or pnpm workspace boundary. Explicit
`--env` flags replace both the profile and defaults, and resolve from the
invocation directory. Missing configured files fail before loading the app;
credentials are never printed. The CLI handles loading directly, so no launcher
script or shell exports are required. Package scripts in monorepos can forward
with `pnpm --filter my-agent eval`.

Model credentials remain application-owned, for example `OPENROUTER_API_KEY`
for an OpenRouter app judge. Studio's judge settings are not used by this command.

Omitting `--suite` runs all configured suites in definition order. `--case` accepts
space-separated case IDs and requires `--suite`. `--repetitions` and `--concurrency`
override the SDK's run settings; omitted flags preserve them. `--export NAME`
selects another named instance instead of `evals`/default.

Interactive terminals show an animated suite progress bar, one live row per active
attempt, elapsed time, and the actual setup, workflow, interrupt-response, judging
and cleanup phases. Every completed step and case gets its own result, followed
by a colored suite verdict and counts. Long calls keep animating; concurrent
attempts remain distinct. The bar measures completed attempts, not estimated model
completion. Application logs/warnings are preserved above the live display.
Piped output is plain text with per-case start and step results; `--no-color` or
`NO_COLOR` disables color/live progress. Explicit `--color` forces the interactive
report, including when `NO_COLOR` is set. `--json` always disables the terminal UI.
`--json` replaces the report with one JSON object containing `schemaVersion: 1`, `status`, aggregated
`counts`, and full SDK `runs` (including observations). Keep application logs off
stdout when consuming JSON. Configuration/import failures use stderr.

Exit status is `0` when all selected suites pass, `1` for failed/errored runs or
configuration errors, and `130` for cancellation. Ctrl+C forwards an abort signal,
allows SDK cleanup and stops later suites. Cancellation remains cooperative: app
code must honor its signal. Results are returned in the terminal/JSON; this local
command does not save eval records to Studio. Agent telemetry, if configured by
the application, continues to follow its existing settings.

## Local runner source references

- `packages/cli/src/evals/command.ts`: discovery, selection, SDK execution, cancellation and exit codes.
- `packages/cli/src/evals/reporter.ts`: terminal progress, verdicts, criteria/evidence and summaries.
- `packages/cli/src/index.ts`: module loader, environment loading and command registration.
- `packages/cli/test/local-evals.test.ts`: real SDK runs, reporting, filtering, missing judges, cancellation and process cleanup.

## Eval run costs

Run history and each run's case table show model costs. The run summary and
case inspector provide a **Workflow / Judge / Total** breakdown. Workflow cost
uses recorded generation telemetry for the attempt's session in the same project
and environment, including child workflows, retries and resumed turns. Enable
normal agent telemetry to record these calls. `toolExecution.emit: true` supplies
tool evidence to the judge; it does not itself enable billing telemetry.

`createEvalJudge` captures provider usage separately from the generated verdict.
Both app-owned and Studio-owned judges report it, including a paid call whose
verdict fails validation. OpenRouter reports actual charges; BYOK uses upstream
inference cost when supplied. Other model usage uses Studio's effective model
rate cards. These calculated charges are marked **estimated** in the tooltip.
No extra cost-related environment variable is required. Custom judges may report
usage through `EvalGradeInput.onUsage`; without it their cost remains unknown.

A `+` after a displayed amount means a known subtotal, with more cost possible.
A dash means unavailable, including absent telemetry or prices. Running or
unfinished attempts stay partial; currencies are combined only when compatible.
Historical workflow costs can be recovered from existing telemetry, but historical
judge charges without recorded usage cannot be recovered. Costs cover recorded
model calls, excluding infrastructure and external tool fees. They are not an
independent reconciliation of a provider invoice. Cancellation can leave billing
evidence incomplete when a remote call finishes after the executor disconnects.

Local `kortyx evals run --entry …` still executes without Studio and does not save
a Studio record. Use the registered Studio execution endpoint to save runs and
view their combined costs in Studio.


## Grouped evaluation runs

The default Runs list shows one evaluation per trigger. A parent evaluation owns
one or more suite executions for a single application/environment. Open a row to
see every suite and its live progress, then open a suite to inspect cases and
assessment/trace evidence. Older suite runs remain visible with their original
links. Suites remains the definition/history view.

The **Run evaluations** drawer offers All suites or Selected suites. Launching
from a suite page preselects and expands that suite. Expand any selected suite to
choose its conversations independently. Suite checkboxes select or clear every
conversation and show a mixed state for partial selections. Selections and
expanded suites survive reloads and browser history. Without a project judge default, the drawer selects Studio
when available, otherwise App; unavailable judges remain disabled with a reason.
Repetitions (1–20) and concurrent attempts across the evaluation (1–20) apply to the selection.
Each suite is limited to 100 attempts; one evaluation is limited to 1,000 attempts.
Missing App judge configuration is explained beside the disabled option.

The Studio API snapshots all selected suite revisions and the judge before
atomically saving the parent and suite jobs. A worker claims all suite jobs together and schedules attempts round-robin across
suites, sharing the configured concurrency budget. A slot includes setup, execution,
cleanup, and grading. Consumer apps must use an SDK that advertises attempt scheduling;
older endpoints receive an upgrade message before a multi-suite run is queued.
Custom worker stores must return all sibling suite leases together from `claim`;
independent single-suite claims cannot enforce an evaluation-wide budget.
Cancelling the parent cancels queued suites and requests cooperative cancellation
of running suites. Cancelling one child suite stops its queued attempts and drains
its active attempts through cleanup while other suites continue. A lost lease or
uncertain transport outcome stops new dispatch without replaying attempts.
Finished suites remain available; cancellation never rolls
back tool side effects. A run remains Running until every suite is terminal.
Execution/grading errors, behavioral failures, and cancellation stay distinct.

```sh
# Enqueue all deployed suites and return a parent ID and Studio link.
kortyx studio evals runs start --all --connection staging --target catalog --json

# Run selected suites, wait, and return machine-readable final results.
kortyx studio evals runs start --suite catalog-smoke --suite product-ambiguity \
  --connection staging --target catalog --wait --timeout 1800 --json

# Read grouped history and results. Existing suite-run IDs/URLs remain readable.
kortyx studio evals runs list --connection staging --json
kortyx studio evals runs get EVALUATION_UUID --connection staging --json
kortyx studio evals runs get EVALUATION_UUID --connection staging --include-content --json
kortyx studio evals runs wait EVALUATION_UUID --connection staging --timeout 1800 --json
kortyx studio evals runs cancel EVALUATION_UUID --connection staging --json
```

`get` returns aggregate counts and per-suite case/criterion pass-fail outcomes.
`--include-content` additionally returns definitions, observations, reasons and
execution evidence with best-effort credential redaction. A positional suite ID
is still accepted by `runs start`, and now creates a single-suite parent.
`wait` supports grouped evaluation IDs; use `get` to inspect legacy suite runs.

`--wait` and `runs wait` exit 0 for Passed, 1 for failed criteria, 2 for execution,
grading, or waiting errors, and 130 for cancellation. A wait timeout does not
cancel the evaluation. Without `--wait`, success only means the run was accepted.
The CLI does not automatically retry POSTs. Use `--idempotency-key` to reuse an
identical request after a trigger retry; reusing the key with changed selection,
revisions, execution settings or metadata returns a conflict. Run creation is
atomic, so failed validation never leaves a partial selection queued.

## Deployment and scheduled CI examples

Kortyx has no native cron scheduler. CI can invoke the same CLI after a successful
deployment/readiness check, or on a schedule. Pin a compatible CLI in the lockfile,
provide a Studio project key with `studio:read`, `eval:run`, and environment access,
and ensure the CI runner can reach the Studio API.

Example post-deployment job step (after readiness):

```yaml
- name: Evaluate deployed application
  continue-on-error: true # Report results initially; remove when trusted as a release gate.
  env:
    KORTYX_DEPLOY_EVAL_KEY: ${{ secrets.KORTYX_DEPLOY_EVAL_KEY }}
  shell: bash
  run: |
    set +e
    pnpm exec kortyx studio evals runs start --all \
      --target catalog --environment staging --judge studio \
      --api-url https://api.example.com --api-key-env KORTYX_DEPLOY_EVAL_KEY \
      --source deployment --commit "$GITHUB_SHA" \
      --deployment-url "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" \
      --idempotency-key "deploy-$GITHUB_RUN_ID" --wait --timeout 1800 --json > eval-results.json
    eval_exit=$?
    if jq -e '.run' eval-results.json >/dev/null 2>&1; then
      jq -r '"Evaluation: \(.run.name) — \(.run.status)\nSuites: \(.run.completedSuites)/\(.run.suiteCount)\nPassed: \(.run.counts.passed), failed: \(.run.counts.failed), errors: \(.run.counts.error)"' eval-results.json >> "$GITHUB_STEP_SUMMARY"
      jq -r '"[Open evaluation](https://studio.example.com/evals/evaluations/\(.run.id))"' eval-results.json >> "$GITHUB_STEP_SUMMARY"
    fi
    exit "$eval_exit"
```

For nightly checks, invoke that CLI step in a workflow with these triggers and
change `--source deployment` to `--source schedule`:

```yaml
on:
  workflow_dispatch:
  schedule:
    - cron: '0 2 * * *' # UTC
```

A trigger owns frequency and idempotency. `--commit` must identify the application
actually deployed; in a scheduled workflow, discover that commit from your
application's version endpoint instead of assuming the checked-out CI commit is
running on the server. An evaluation pins suite and judge definitions, but does
not freeze the deployment or external data while execution is in progress.

The grouped API is `/v1/studio/evals/evaluations`: POST creates a selection, GET
lists grouped/legacy history; `/:id` returns summary and suites, `/:id/results`
returns detailed results, and POST `/:id/cancel` cancels remaining work. Existing
`/v1/studio/evals/runs` endpoints continue to serve individual suite executions.
Apply migration `0007_evaluation_runs` before deploying the new API. Browser and
CLI grouped operations require a compatible Studio/API release.

For frontend-aware criteria and evidence controls, read [eval-criteria-and-evidence.md](eval-criteria-and-evidence.md). Configure selection in the app; Studio replays selected evidence and retains full observations for debugging.

## Concurrent execution recovery

New Studio negotiates `jobs-v1` with `createEvalRouteHandler`, scheduling each
case/repetition independently. Busy 429/503 admission uses bounded Retry-After
retries; accepted jobs reconnect by event cursor without rerunning the case.
Forward GET, POST and DELETE, including query strings and negotiation headers.
Keep long-running execution alive independently of the observer connection.
Explicit cancellation is cooperative and capacity remains occupied through cleanup.

The default `createInMemoryEvalExecutionStore()` handles one process. For replicas,
pass `createPostgresEvalExecutionStore({connectionString,namespace})` as
`executionStore`, with identical service keys, suite definitions and capacity
settings. Configure `maxActiveRuns` (1), `maxActiveAttempts` (20) and
`maxQueuedExecutions` (1000). Call store.setup() before traffic. For planned
retirement call handler.drain(), keep HTTP/store available for authenticated
observation and cancellation, then close HTTP, handler and store after observers
finish. handler.close() remains explicit abort. Drain rejects ambiguous admission,
claim or terminal persistence; do not treat that as successful retirement.
Matching jobs-v1 POST retries for known IDs reattach evidence during drain;
changed content returns 409. New IDs are refused without admission or replay.
With a single consumer, drain Studio workers first while the consumer still
accepts their later cases, wait for durable Studio outcomes, then drain the
consumer. With replicas, make a compatible replacement reachable first with the
same durable store/namespace, service key, suite revisions and capacity settings.
Consumer drain finishes its own active jobs and a bounded queued snapshot, not
future Studio cases or another owner's live jobs. The built-in memory/PostgreSQL
stores implement optional queued/claimQueued capabilities; old custom stores work
normally but drain fails until these atomic scoped capabilities are implemented.
Upgrade agent/runtime together; jobs-v1 and legacy wire formats are unchanged.
Queued jobs recover across restart; a lost running
lease becomes Unknown and is never automatically replayed. Inspect side effects
before explicit cancellation or a new run. Application nodes own external
idempotency; no data reducers or node/workflow shape changes are required.
Upgrade consumers before API/Studio; legacy consumers keep request-owned streams.
Verify hook availability in the installed build: published kortyx 0.32.0 / agent
0.39.0 / runtime 0.25.0 lack consumer drain. Use a later coordinated release that
includes it; never silently substitute aborting close when graceful drain is absent.

## Evaluation settings and timeout reporting

**Settings → Evaluations** stores sparse project defaults in
`projects.eval_defaults`. Reading uses the existing project Studio permission;
saving requires `studio:write` through the installation's authorization adapter.
The run drawer shows effective repetitions, concurrency, case timeout, overall
evaluation timeout and judge, along with their source. Enter a value to override
it for that run; Reset to default removes that override. There is no separate
inherit mode. Project defaults apply to the whole project across targets and
environments; application-specific defaults stay in the SDK.

Per-field precedence is run override → Studio project default → SDK declared
default → built-in. Installation timeout defaults sit below project defaults.
The enqueue operation validates application ceilings and freezes effective values
and sources on the evaluation and suite records, so edits do not change queued
or historical runs. Idempotent retries retain the original frozen settings.

The overall deadline defaults to **30 minutes**, independently of individual
case timeouts, and is shared by every suite in an evaluation, including Studio
grading. It starts at execution, excluding queue wait. Configure the Studio API:

```dotenv
KORTYX_EVAL_RUN_TIMEOUT_MS=1800000
KORTYX_EVAL_MAX_RUN_TIMEOUT_MS=7200000
```

The first variable sets the installation default. The second is an optional
administrator ceiling, independent of run/project precedence. Without it the
supported timer ceiling is 2,147,483,647 ms. The installation default must fit
under the ceiling. Docker Compose and CLI-managed installations forward both
variables; restart the API after changing them.

Timeouts show **Timed out** in evaluation history, evaluation detail and suite
detail, with the configured limit, completed/remaining attempt counts and known
pending phases. Completed grades and observations remain available; unstarted
attempts are distinct from interrupted work and work awaiting grading. Active
consumer cancellation/cleanup is signalled, with no claim that external side
effects have rolled back or cleanup has finished. Errors are not behavioral fails.

The evaluation header shows compact notices with the actual timeout or error
reason, leaving the results table visible. Clicking a notice opens the shared
error dialog with occurrence navigation, affected execution links, original
messages, stacks, causes and provider response details. Run metadata and frozen
execution settings are available under **Run details**. Selected errors (`?error=`)
and Run details (`?runDetails=true`) use URL state, including reload and browser
Back/Forward. Error navigation keeps the dialog size stable and reuses previously
loaded evidence within the current workspace. Case cards also show the original
exception automatically.

SDK and Studio execution, grading, cleanup and reporting errors use the same
project-scoped diagnostic occurrence store, retention, permissions and detail
viewer as workflow run errors. Evaluation, suite, case, attempt and phase context
are recorded when available. Existing SDK diagnostic references are reused;
progress and final results share a reference rather than creating a second
occurrence. One overall timeout creates one occurrence referenced by interrupted
suites; unstarted attempts do not create fabricated errors. Cancellation remains
a distinct control outcome. This provides shared records for a future Errors
section; that inbox is not introduced here.

Only credential fields/patterns are redacted. Capture omissions or unavailable
older evidence are identified explicitly. No capture flag or custom reporter is
required. These are customer execution diagnostics, excluded from maintainer
usage telemetry.

Apply migration **0013_eval_settings** before starting the new API. Deploy the
matching API and Studio before upgrading SDK/CLI emitters: old strict validators
may reject additive fields. Old consumers remain usable with repetitions and
concurrency; case-timeout overrides are disabled/rejected until their SDK
advertises support. Older stored runs load without invented settings or timeout
reasons. Roll back emitters first if reverting API/Studio; the added nullable
columns and project defaults can remain. Browser case authoring is future work;
the serializable settings contract also supports future Studio-authored suites.

## Optional launch overrides

For planned worker replacement, keep the owning worker alive to finish active
suites, renew leases, report progress and persist results while a replacement
accepts new jobs. Worker admission drain and HTTP connection drain are separate.
User cancellation and the run's configured deadline still apply. The Studio API
worker host hook distinguishes `drain()` from the existing aborting `stop()`.
Verify deployed binary capabilities first: published Studio/API 0.22.0 has neither
SIGUSR2 preparation nor the standalone worker command. Its unhandled SIGUSR2 is
not a claim fence (Linux PID 1 can ignore it). First upgrade needs an external
submission fence, settled queued work and completed active evaluations before
old processes retire. Saved Compose files do not gain grace settings from an image
update. A fixed grace extension alone does not protect arbitrary run deadlines.
The bundled OSS API implementation uses drain on SIGTERM; SIGINT explicitly aborts.
Explicit stop during a pending worker drain rejects that drain. A lost claim
acknowledgement requires an authoritative ownership check before retirement can
succeed. The stock PostgreSQL store checks after local tasks/claims/heartbeats
settle; expired-but-running ownership still blocks it. Repeating SIGUSR2 retries
this read-only check without resuming claims or replaying tools. Custom stores may
implement `confirmRetirement(owner)`; otherwise ambiguity still fails closed.
Original causes are retained in scoped diagnostics with safe owner/phase metadata
in operator logs. These capabilities require a worker release containing them.
SIGUSR2 prepares evaluation draining while HTTP remains available for submissions,
progress and cancellation. Wait for the verified owner's drained confirmation
before terminating a singleton combined API/worker. Platform force-kill deadlines
still apply; the 25-second HTTP drain is not an evaluation timeout.

For independent worker retirement, set `KORTYX_API_EVAL_WORKER_ENABLED=false`
on web-only APIs and run `node apps/api/dist/eval-worker.js` from the API image
with the same targets and applicable judge settings. Its private health listener
serves `/live`, `/health` and `/ready` only; draining is alive but unready for
new claims. Use liveness, not admission readiness, for restart decisions.
For normal compatible rollout, start the replacement while the old owner still
accepts work, verify `/ready` (including a successful queue check), drain the old
owner, then remove it after `drained`. Web-only releases do not need worker
retirement when contracts remain compatible. Keep persistent database storage
outside container replacement. Strict singleton replacement needs maintenance
and queues work until its replacement starts. Overlap needs enough host capacity
and an explicitly compatible rolling release; a `recreate` release is not rolling. Set
`KORTYX_EVAL_MAX_CONCURRENT_EVALUATIONS` identically on all OSS workers (default
four evaluation groups across the database, including draining owners). Custom
stores must enforce their own shared cap; legacy workers and direct claim callers
without that cap do not provide this guarantee. Consumer endpoint and provider
limits remain independent.

Queue waiting does not consume the execution deadline; a CLI wait timeout does
not cancel or justify resubmitting a run. Cancel queued work through the API.
The consumer's own host must remain available. Its route handler `drain()`
finishes already accepted jobs without abort; `close()` explicitly aborts. A
singleton consumer must remain admitting until Studio workers finish all their
claimed suites. Drain that consumer afterwards; see the endpoint contract above.
Replicas alone do not transfer an in-flight evaluation, and a lost executor must
follow the consumer/store recovery contract rather than blindly repeating tools.

`kortyx studio evals runs start` accepts `--case-timeout-ms` and
`--run-timeout-ms`, independently of `--timeout` (the CLI wait budget).
Omitted repetitions, concurrency, judge and deadline flags resolve on the server
using project/SDK defaults. For example:

```sh
kortyx studio evals runs start --all --connection staging --target catalog \
  --run-timeout-ms 5400000 --case-timeout-ms 180000 --wait --timeout 5500 --json
```

A wait timeout does not cancel the server evaluation. `runs get --json` includes
structured termination, frozen effective settings and original error issues by
default; `--include-content` additionally includes full conversations/events.
