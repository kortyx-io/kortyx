# Run consumer evals from Studio

Studio can discover registered suites, select cases and repetitions, enqueue a run,
observe each completed interaction, cancel execution, and reload saved results.
The consumer app executes its own agent. Studio does not obtain end-user tokens,
implement application permissions, or invoke the application's chat endpoint.

```ts
import { createEvals, createEvalJudge, createEvalRouteHandler } from "kortyx";

const evals = createEvals({
  agent,
  suites,
  setup,       // optional: authenticate the test actor or prepare fixtures
  execute,     // bind the app's normal permission/tool context, then await run()
  responders,  // typed app handlers referenced by JSON resume steps
  references,
  judge: createEvalJudge({ model: evaluationModel }),
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
The handler requires a bearer service key, bounds attempts and concurrent runs,
and signals cooperative cancellation when its client disconnects.

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
Comparison describes observed differences. Missing actor/data/prompt identity
is shown as incomplete context; it does not establish why an outcome changed.

This release supports suites authored in app code or JSON, sequential interactions,
and LLM grading of public answers, interrupt requests and emitted tool evidence.
Tool-based grading requires `toolExecution.emit: true` in the workflow. The judge
uses the existing stream, including results from earlier steps before a resume.
See the conversation eval guide for the capture boundary. Studio suite editing,
prompt-variant injection, scheduled runs, retention controls,
and an executor protocol for simultaneous interrupts or durable background work
remain subsequent work. Prompt changes can be checked by rerunning the same
suite against the changed consumer; prompt/version pinning is not implemented.

Use the [CLI commands and post-deployment CI example](./cli-and-ci.md) to discover,
start, inspect and cancel runs from the same Studio API.

## Verification

SDK runner and transport tests exercise interrupt/resume, cleanup, mismatch/error
classification, private context isolation, authorization, stale revisions and limits.
API persistence integration tests use a dedicated loopback database, apply the full
migration chain, and verify exclusive claims, tenant isolation, queued cancellation,
expired leases without replay, a complete HTTP interrupt/resume run, and active
cancellation that signals a running consumer.

```sh
docker run -d --name kortyx-evals-disposable-tests \
  -p 127.0.0.1:7543:5432 -e POSTGRES_PASSWORD=local-eval-test \
  -e POSTGRES_DB=kortyx_evals_test postgres:17-alpine
TEST_EVAL_DATABASE_URL=postgres://postgres:local-eval-test@127.0.0.1:7543/kortyx_evals_test \
  pnpm --filter @kortyx/api exec vitest run test/evals.integration.test.ts
# Remove the disposable container after verification.
```

## Structured output requirements

Studio shows `expect.outputs` in each conversation step and saved case evaluation.
The consumer checks every required completed contract before app or Studio semantic
grading. An omitted `schemaVersion` means any version; a supplied version must
match exactly. Missing contracts have a failed step with a reason identifying
the missing ID/version. Their partial stream and other finalized outputs remain
available for debugging. Payload meaning is assessed by the configured criteria.
See [the SDK guide](./sdk-runner.md#required-structured-outputs) for authoring,
custom executor envelopes and interrupt boundaries.
