---
id: v0-studio-evals
title: "Run Eval Suites in Studio"
description: "Run workflow conversation suites, inspect grades and compare saved results using existing Studio credentials."
keywords: [kortyx, studio, evals, suites, comparison, cli, ci]
sidebar_label: "Evals"
section: "guides"
---
# Run consumer evals from Studio

For a new integration, follow [Run Your First Workflow Eval](./12-first-eval.md)
from application wiring through deployment diagnostics and a completed run.
This page covers the detailed execution, judging and storage behavior.

Studio can discover registered suites, select cases and repetitions, enqueue a run,
observe each completed interaction, cancel execution, and reload saved results.
The consumer app executes its own agent. Studio does not obtain end-user tokens,
implement application permissions, or invoke the application's chat endpoint.

```ts
import { createEvals, createEvalRouteHandler } from "kortyx";

const evals = createEvals({
  agent,
  suites,
  setup,       // optional: authenticate the test actor or prepare fixtures
  execute,     // bind the app's normal permission/tool context, then await run()
  responders,  // optional: app handlers referenced by JSON resume steps
  teardown,    // optional: release resources prepared for each case
  // No code judge required: Studio can grade the captured execution.
});
const handleEvals = createEvalRouteHandler({
  evals,
  serviceKey: process.env.EVAL_SERVICE_KEY!,
});
// Mount handleEvals(Web Request) -> Web Response using your server framework.
```

`GET` returns the public manifest. `POST` accepts a suite ID, its SHA-256 revision,
optional case IDs, repetitions, and concurrency. It streams validated NDJSON
progress records and one final result. A changed suite is rejected before execution.
The handler requires a bearer service key of at least 32 characters, bounds
attempts and concurrent runs, and signals cooperative cancellation when its
client disconnects.

For every variable's default, owning service, credential purpose and restart
requirements, see the [Configuration Reference](./08-configuration-reference.md).

## Register applications on the Studio API server

Set `KORTYX_EVAL_TARGETS_FILE` to a secret-manager supplied JSON file:

```json
[
  {
    "id": "catalog",
    "name": "Catalog agent",
    "organizationId": "YOUR-ORGANIZATION-UUID",
    "projectId": "YOUR-PROJECT-UUID",
    "environment": "development",
    "url": "https://your-app.example/v1/evals",
    "serviceKey": "YOUR-APPLICATION-EVAL-SERVICE-KEY"
  }
]
```

The server fixes target URLs and credentials; the browser cannot submit an arbitrary
URL or token. HTTPS is required unless `allowInsecureHttp: true` is explicitly set
for a local target. Targets, history, details and cancellation are scoped to the
Studio API key's organization and project. Execution also requires `eval:run` and
an allowed project environment. Reading uses the existing `studio:read` scope. The current browser proxy supports
local `none` and deployed `basic` Studio auth modes. Suite execution uses the
existing server-side Studio key; it does not require a new login system.
For the local Docker bootstrap, opt in with `KORTYX_STUDIO_ENABLE_EVALS=1` and rerun
bootstrap with the same stored Studio key. Execution is disabled by default.

### Where application metadata comes from

The target file supplies the application **ID**, display **name**, endpoint and
**environment**. They are operator-defined labels, not inferred from model calls
or the agent's telemetry service name. The application's manifest supplies the
suite IDs, case definitions, revisions, named handlers and optional code judge.

Studio copies `targetId`, `targetName` and environment into each saved run. The
application filter combines currently configured targets with labels from saved
history. Removing a target stops discovery and new execution, but its historical
runs and application filter entry remain. Suite discovery shows currently
registered suites; saved runs retain the definition used when they started.

Use stable target IDs. Renaming a target changes its label for new runs; existing
records keep the saved label. The filter groups by target ID and displays a label
from the current configuration or saved history. Two environments can be
registered as separate targets with distinct IDs and clear names.

### Credentials have separate jobs

| Credential | Where it is configured | What it authorizes |
| --- | --- | --- |
| Project Studio key | Studio server or CLI connection | Project discovery/history with `studio:read`; execution/cancellation with `eval:run` |
| Application eval service key | Consumer route and Studio API target file | Studio API access to that app's eval endpoint |
| Test actor credentials | Consumer application's server configuration/setup | The app's normal user identity, roles and data access |
| Judge provider key | Studio API backend for Studio judging; consumer app for App judging | Model requests for semantic grading |

The service key authorizes starting evals; it does not impersonate an application
user. The consumer's setup and execute callbacks bind that user through the same
permission path used by ordinary application requests.

## Studio judge configuration

Studio-triggered runs default to **Studio judge**. Configure its model and provider
key on the Studio **API backend**. A code judge provided to `createEvals` makes
**App judge** available as an explicit selection; Studio still defaults to its own
judge. If hosted judging is not configured, the run drawer explains what is missing
and allows selecting an available App judge. It never silently changes selection.

The app executes the complete scripted scenario and resolves interrupts. With
Studio judging, it returns captured evidence awaiting evaluation, then the Studio
worker grades that evidence and stores the final results. App judging runs inside
the app at each step. The browser never calls a model directly. The app needs no
Studio grading key or model configuration for the hosted path.

Enable the backend judge on the **API service**:

```dotenv
KORTYX_EVAL_JUDGE_MODEL=gpt-5.4-mini
KORTYX_EVAL_JUDGE_API_KEY=<server-owned provider key>
# Optional overrides:
# KORTYX_EVAL_JUDGE_ID=studio/my-judge
# KORTYX_EVAL_JUDGE_VERSION=kortyx-rubric-v4
# KORTYX_EVAL_JUDGE_API=responses
# KORTYX_EVAL_JUDGE_BASE_URL=https://api.openai.com/v1
```

The default server adapter uses Kortyx's OpenAI provider and its Responses API.
Set `KORTYX_EVAL_JUDGE_API=chat-completions` for compatible Chat Completions
endpoints. A custom HTTPS endpoint must support the selected API and structured
JSON verdicts.
Custom API hosts can instead inject any `EvalJudge` through
`createApiApp({ ..., evalJudge })`, including a judge built with another Kortyx
provider. Leaving the model unset disables hosted judging; app-side judging and
ordinary Studio execution remain available.

For OpenRouter, use its model slug and server-side API key:

```dotenv
KORTYX_EVAL_JUDGE_BASE_URL=https://openrouter.ai/api/v1
KORTYX_EVAL_JUDGE_API=chat-completions
KORTYX_EVAL_JUDGE_MODEL=openai/gpt-4o
KORTYX_EVAL_JUDGE_API_KEY=<OpenRouter API key>
KORTYX_EVAL_JUDGE_ID=studio/openrouter/openai/gpt-4o
```

Choose a model/provider combination that supports [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).
The OpenRouter chat endpoint uses Kortyx's native OpenRouter provider, including
its reported billing usage. A live OpenRouter account is needed to verify the
configured model and provider route.

Docker Compose and CLI-generated Studio stacks pass these variables only to the
API container. For a CLI-managed stack, add them to the existing owner-only
`<studio-home>/.env` and restart with `kortyx studio start --home <studio-home>`.
CLI startup preserves these private settings. For other deployments, use the
API service's normal secret configuration. Provider credentials are never
returned by judge discovery or included in run results.

The browser and CLI use the existing project key with `studio:read` and `eval:run`
to enqueue runs. The app's eval service key stays in server target configuration.
Project and environment access is enforced on the Studio API. Provider credentials
are never sent to the app or browser.

Suite discovery advertises a code judge when one is configured and the consumer's
Studio judging capability. The run drawer stores its selection in the URL. The API
pins the selected judge identity in the saved request; the worker rejects a changed
Studio judge before starting the app. The consumer similarly rejects a changed
code judge. Missing configuration, provider failures and malformed verdicts produce
errors instead of passing scores. Captured cases display **Awaiting evaluation**
until Studio has graded them. Cancellation covers execution and grading.

The optional `/v1/studio/evals/judge` endpoint remains available for explicit
`createStudioEvalJudge` calls from code. It authenticates each request using a
project Studio key, checks its environment, pins identity and bounds input size,
concurrency and grading deadlines. Ordinary Studio runs grade within the worker
and do not call this endpoint. Saved-run regrading and editable evaluator libraries
are not included in this release.

## Judge criteria and evidence

Configure what the judge receives in the application: `createEvals.defaults.evidence`
provides defaults, and `suite.evidence` overrides individual fields. Studio uses
the saved selected evidence for grading; full observations remain available for
debugging. These are SDK configuration options, not switches in the run drawer.

The judge sees compact execution evidence as well as answer content. Criteria
must explain which structured fields the frontend shows as messages, prose, or
cards and which are progress-only or internal. Each criterion is graded separately.
An emitted output does not prove it was displayed in the browser.

See [writing criteria](../../sdk/v0/03-guides/10-conversation-evals.md#write-criteria-for-the-evidence-your-app-produces)
and [evidence defaults, overrides, and filters](../../sdk/v0/03-guides/10-conversation-evals.md#compact-judge-evidence)
for examples, including disabling history/events/outputs for text-only checks.
Keep any supporting tool results or reference facts required by the criterion.

## Eval run costs

Run history and each run's case table show model costs. The run summary and
case inspector provide a **Workflow / Judge / Total** breakdown. Workflow cost
automatically follows native Kortyx executions across all runtime sessions used
within an attempt, including setup, cleanup, child workflows, retries and resumed
turns. `defineSuite` and existing execution hooks need no changes. An application
can update a record in session A and verify it in a fresh session B; both sessions
stay independent and their recorded generations count once for the attempt.
The attempt keeps its own identity, and unrelated work in a reused session is
excluded. Project and environment boundaries still apply. Enable
normal agent telemetry to record these calls. `toolExecution.emit: true` supplies
tool evidence to the judge; it does not itself enable billing telemetry.

Upgrade Studio before upgrading the consumer's agent and telemetry SDKs together:
progress and saved results now carry optional attempt identities and runtime
execution associations. Older saved results retain session-based attribution.
Attribution is automatic within the consumer process; custom executors that call
another service do not propagate it across HTTP or queue boundaries. Such calls
remain unavailable unless that integration carries attribution. An associated
execution with no recorded generation keeps the subtotal partial or unavailable.

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

## Persistence and execution lifecycle

Apply `packages/telemetry-db/drizzle/0005_eval_runs.sql` through the regular
migration runner before starting the updated API. Each queued record stores its
suite and revision, selection, target and environment. PostgreSQL row locking
allows a worker replica to claim a record once. A lease and heartbeat track active
execution. Progress is saved incrementally; the final result contains public
observations (including emitted execution events), expected behavior, optional
references, grader version, reasons,
and evidence. Studio receives scoped SSE change notifications backed by PostgreSQL
`LISTEN`/`NOTIFY`, then reads the saved result. Runs, case drawers and history
update on changes; completed runs also receive late workflow billing updates.
Live mode is on by default for eval views and can be paused with `?live=false`.
The connection pauses while the tab is hidden or offline, reconciles on reconnect,
and uses a 30–60 second refresh fallback during an outage. There is no periodic
polling while connected. A browser reload does not terminate the run.
Caller-visible observations may contain business data and require the same access
and retention policy as ordinary Studio session data.

A consumer disconnect, timeout, or worker crash is an execution error rather than
a failed behavioral grade. An expired lease is marked unknown/error and is never
automatically retried: replaying application workflows can repeat side effects.
Operators should inspect consumer execution before explicitly starting another run.
Cancellation wins the final-storage race when its request is already saved.
The worker actively closes an aborted response reader to signal the consumer; custom setup, tools and cleanup must honor the
signal. A worker shutdown does not promise rollback or prove remote cleanup.

Studio supports saved-run comparison, including per-case outcomes, criterion
verdicts, repeated attempts and workflow inspection through stacked drawers.
Comparison describes observed differences. Its context notice identifies missing
actor/data/prompt identity; it does not establish why an outcome changed.

This release supports suites authored in app code or JSON, sequential interactions,
and LLM grading of public answers, interrupt requests and emitted tool evidence.
Tool-based grading requires `toolExecution.emit: true` in the workflow. The judge
uses the existing stream, including results from earlier steps before a resume.
See the conversation eval guide for the capture boundary. Studio suite editing,
prompt-variant injection, scheduled runs, retention controls,
and an executor protocol for simultaneous interrupts or durable background work
remain subsequent work. Prompt changes can be checked by rerunning the same
suite against the changed consumer; prompt/version pinning is not implemented.

Use the [CLI commands and post-deployment CI example](./04-cli-commands.md#eval-suites-and-post-deployment-ci) to discover,
start, inspect and cancel runs from the same Studio API.

## Use the interface

Open **Evals → Suites** to browse the applications and cases registered by your
consumer. Select a suite to inspect its definition in a drawer, or open it as a
full page. Choose cases, repetitions and concurrency, then start the run.

**Evals → Runs** lists saved runs. A run shows live progress and final case
outcomes. Open a case to read evaluation reasons first, then expand conversation
and debugging details. **Inspect workflow** opens the existing workflow drawer
on top; closing it returns to the case. Page URLs, filters and selections survive
reloads and browser Back/Forward.

Use **Compare** on a saved run and select a baseline from the same target/suite.
The **candidate** is the run you are inspecting. The **baseline** is another
saved run you choose as a reference; it is not an expected answer or a newly
executed workflow. Comparison reads their saved grades without calling a judge
or rerunning either application.

Cases are matched by case ID. For comparable cases, Studio compares the share
of passed attempts, including repetitions:

| Label | Meaning |
| --- | --- |
| Improved | Candidate has a higher pass rate |
| Regressed | Candidate has a lower pass rate |
| Unchanged | Both have the same pass rate; their outputs can still differ |
| Incomplete | An attempt is missing, ungraded, errored, cancelled or otherwise lacks a completed result |
| Context changed / not comparable | Target, environment, case definition, judge identity, recorded input or reference differs |

For example, 1 of 3 passed in the baseline and 3 of 3 in the candidate is
**Improved**. A provider error is **Incomplete**, not a behavioral regression.
Open a comparison case to inspect both sides' attempts, outputs, criteria and
workflow links.

Actor identity, external data snapshots and prompt versions are not automatically
pinned. Tool results can change even when the recorded inputs are identical.
Treat comparison as observed pass-rate differences, not proof that a prompt
change caused them. Rerun the same suite with stable actor/data and review the
actual evidence when testing a prompt change.

## Container configuration

Mount the private target file on every Studio API replica and set the variable
on the API service, using the container path. The browser Studio service does
not need the file or application service key. For Docker Compose:

```yaml
services:
  api:
    environment:
      KORTYX_EVAL_TARGETS_FILE: /run/secrets/kortyx-eval-targets.json
    volumes:
      - ./eval-targets.json:/run/secrets/kortyx-eval-targets.json:ro
  db-init:
    environment:
      KORTYX_STUDIO_ENABLE_EVALS: "1"
```

Use this as a deployment override alongside the normal Compose file. For a
CLI-managed local installation, keep it outside generated state and apply it
when starting/recreating services: `studio start` regenerates its base Compose
file. Retain the existing environment file and project name, and rerun
`db-init` to update the existing Studio key scopes before recreating the API.

The bootstrap output provides the organization and project IDs for target
registration. Add an allowed project environment before using it in a target.
A container cannot reach a host application at `localhost`; Docker Desktop
typically uses `host.docker.internal`, or use an application on the same Docker
network. Local HTTP targets need `allowInsecureHttp: true`; remote targets use HTTPS.

Targets are loaded when the API starts. Restart the API after changing the
target file. Missing targets leave Suites empty; an unreachable endpoint shows
the target unavailable. Run controls require `eval:run` on the existing key.
Read-only keys can still inspect saved results. An endpoint's service key is a
separate credential from the Studio key; neither contains the test user's token.

See [Conversation Evals](../../sdk/v0/03-guides/10-conversation-evals.md) for suite design,
typed setup/responders, Auth0 integration and grading boundaries.

## Required structured responses

Conversation steps can declare `expect.outputs` as an array of required output
contracts. Studio displays each ID and either the exact required version or
“Any version” in the suite definition and case evaluation. The consumer checks
that every contract has a completed visible output before either judge runs.
Partial streams, invalidated outputs and outputs from previous steps do not
satisfy the requirement. Missing contracts fail the step with an explicit reason.
Open the conversation debugging section to inspect the recorded envelopes.
Use pass criteria to assess payload meaning; the output requirements check
contract presence. See [the conversation guide](../../sdk/v0/03-guides/10-conversation-evals.md#required-structured-outputs)
for suite authoring and custom executor support.


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
