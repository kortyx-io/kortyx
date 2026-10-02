---
id: v0-studio-evals
title: "Run Eval Suites in Studio"
description: "Run workflow conversation suites, inspect grades and compare saved results using existing Studio credentials."
keywords: [kortyx, studio, evals, suites, comparison, cli, ci]
sidebar_label: "Evals"
---
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
local `none` and deployed `basic` Studio auth modes. Suite execution uses the
existing server-side Studio key; it does not require a new login system.
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

Studio supports saved-run comparison, including per-case outcomes, criterion
verdicts, repeated attempts and workflow inspection through stacked drawers.
Comparison describes observed differences. Missing actor/data/prompt identity
is shown as incomplete context; it does not establish why an outcome changed.

This release supports suites authored in app code or JSON, sequential interactions,
and LLM grading of public answers and interrupt requests. Studio suite editing,
prompt-variant injection, scheduled runs, cost summaries, retention controls,
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
The comparison shows improved, regressed, unchanged, incomplete and context-changed
cases. Each case exposes candidate and baseline attempts and their grades.
Comparisons do not prove a prompt caused an improvement when data or actor
context is missing or changed.

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

See [Conversation Evals](../03-guides/10-conversation-evals.md) for suite design,
typed setup/responders, Auth0 integration and grading boundaries.
