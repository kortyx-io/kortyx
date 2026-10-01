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
  setup,       // authenticate the test actor and prepare independent reference facts
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
    "id": "hiring",
    "name": "Hiring agent",
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
local `none` and `basic` Studio auth modes; cloud mode fails closed pending
integration with its session authorization.
For the local Docker bootstrap, opt in with `KORTYX_STUDIO_ENABLE_EVALS=1` and rerun
bootstrap with the same stored Studio key. Execution is disabled by default.

## Persistence and execution lifecycle

Apply `packages/telemetry-db/drizzle/0005_eval_runs.sql` through the regular
migration runner before starting the updated API. Each queued record stores its
suite and revision, selection, target and environment. PostgreSQL row locking
allows a worker replica to claim a record once. A lease and heartbeat track active
execution. Progress is saved incrementally; the final result contains public
observations, expected behavior, independent references, grader version, reasons,
and evidence. The UI polls saved records, so a browser reload does not terminate
the run. Caller-visible observations may contain business data and require the
same access and retention policy as ordinary Studio session data.

A consumer disconnect, timeout, or worker crash is an execution error rather than
a failed behavioral grade. An expired lease is marked unknown/error and is never
automatically retried: replaying application workflows can repeat side effects.
Operators should inspect consumer execution before explicitly starting another run.
Cancellation wins the final-storage race when its request is already saved.
The worker actively closes an aborted response reader to signal the consumer; custom setup, tools and cleanup must honor the
signal. A worker shutdown does not promise rollback or prove remote cleanup.

This slice supports suites authored in app code or JSON, sequential interactions,
and LLM grading of public answers and interrupt requests. Studio suite editing,
prompt-variant injection and A/B comparison, scheduled runs, cost summaries,
retention controls, and an executor protocol for simultaneous interrupts or durable
background work are subsequent slices. Prompt changes can already be checked by
rerunning the same suite against the changed consumer, but prompt/version pinning
and automated comparison are not implemented.

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
