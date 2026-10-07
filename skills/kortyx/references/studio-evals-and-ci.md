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

Run migrations for the compatible release, then opt in to execution when
bootstrapping the local Studio project key. From a Kortyx source checkout:

```sh
pnpm db:migrate
KORTYX_STUDIO_ENABLE_EVALS=1 pnpm db:bootstrap
```

This grants `eval:run` to the existing Studio key. It is a bootstrap option,
not an auth bypass at runtime. Reuse the stored key and pepper when rerunning;
do not generate a different key or modify a shared environment merely to enable
local testing. In a packaged deployment, supply the same option to its bootstrap
job. Reading needs `studio:read`; starting/cancelling also needs `eval:run` and an
allowed project environment. Review-write scopes are unrelated.

## Select and configure judging

Studio-triggered runs default to **Studio judge**. A consumer `createEvalJudge`
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
# KORTYX_EVAL_JUDGE_VERSION=kortyx-rubric-v3
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
| `KORTYX_EVAL_JUDGE_VERSION` | Studio API | Optional rubric version; current default `kortyx-rubric-v3`; update when grading semantics change |
| `KORTYX_STUDIO_ENABLE_EVALS` | Database bootstrap job | Exactly `1` grants execution scope to the local Studio key; defaults off |
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
API caps repetitions at 20, concurrency at 4, attempts per suite at 100 and total attempts at 1,000.
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
expanded suites survive reloads and browser history. The default judge is Studio
when available, otherwise App; unavailable judges remain disabled with a reason.
Repetitions (1–20) and concurrent attempts per suite (1–4) apply to the selection.
Each suite is limited to 100 attempts; one evaluation is limited to 1,000 attempts.
Missing App judge configuration is explained beside the disabled option.

The Studio API snapshots all selected suite revisions and the judge before
atomically saving the parent and suite jobs. Existing leased workers execute the
suite jobs; suite-level concurrency does not promise parallel suite scheduling.
Cancelling the parent cancels queued suites and requests cooperative cancellation
of running suites. Finished suites remain available; cancellation never rolls
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
