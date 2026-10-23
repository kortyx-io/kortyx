---
id: "v0-cli-evaluations"
title: "Run evaluations through Studio"
description: "Diagnose an evaluation connection, discover suites, enqueue runs, inspect saved results, and cancel work through a supported Studio API."
keywords: ["kortyx", "cli", "evaluations"]
sidebar_label: "Run evaluations through Studio"
section: "studio-commands"
---
# Run evaluations through Studio

These commands require a supported Studio project key. Cloud CLI account login is not implemented; use the Cloud UI for connected evaluations. [Local terminal evaluations](/docs/cli/local-evaluations) remain available for your application.

## Eval suites and post-deployment CI

The CLI uses the same Studio API, project scopes, application targets, worker,
and PostgreSQL records as the browser. It does not import your agent or obtain
an end-user token. The application handles its test actor in `createEvals.setup`.

Configure the [consumer endpoint and Studio targets](/docs/studio/evals) first.
Your connection key needs `studio:read` for discovery and result inspection, plus
`eval:run` for starting and cancelling. The SDK telemetry write key cannot run evals.
The application's eval service key stays on the Studio API server.



## Diagnose deployment wiring

```sh
kortyx studio evals doctor --connection staging --target catalog --suite catalog-smoke
kortyx studio evals doctor --connection staging --target catalog --judge app --json
```

Doctor checks read/execution scopes, matching targets/environment, authenticated
consumer manifest/suites and configured judge compatibility. It uses discovery
GET only; it starts no workflows, model calls or saved runs. Consumer discovery
wrappers may perform their own authentication. It gives safe failure categories
and remedies; older APIs may return only generic unavailable diagnostics.

`--target`, `--environment`, `--suite` and `--judge` narrow the checks. Connection
environment defaults apply. Use `--api-url` and `--api-key-env` instead of
`--connection` for direct access. `--json` prints one report with `schemaVersion: 1`,
`status` and `checks`; exit 0 means setup checks passed, exit 1 means a failure.
Each check has `id`, `status` (`passed`, `failed` or `skipped`), `message` and optional
`remedy`. Provider credentials, test-user tool permissions and worker execution
still need a real run. Follow [the complete setup recipe](/docs/studio/first-eval).

## Discover and run

```sh
pnpm exec kortyx studio evals suites list --connection staging --json
pnpm exec kortyx studio evals suites get product-ambiguity \
  --connection staging --target catalog --include-content --json
pnpm exec kortyx studio evals runs start product-ambiguity \
  --connection staging --target catalog --case choose-blue \
  --repetitions 3 --concurrency 1 --json
```

Local Studio uses `--connection local` and its managed credentials. A remote
profile references an environment variable containing a project-scoped Studio key:

```sh
pnpm exec kortyx connections add staging \
  --api-url https://api.example.com \
  --studio-url https://studio.example.com \
  --api-key-env KORTYX_STAGING_STUDIO_KEY --environment staging
```

Profiles save URL locators and the variable name, never the remote key. Inject the
key through your shell or CI secret store. Alternatively, pass `--api-url` and
`--api-key-env` together for a direct connection using IDs; do not combine those
flags with `--connection` or `KORTYX_CONNECTION`.

The connection environment filters discovery and history by default. Override it
with `--environment`. If a suite exists on multiple targets, select `--target`.
Repeat `--case` for multiple cases; omit it to run every case. The limits are
20 repetitions, concurrency 20, and 100 total attempts per queued run.

Start discovers the current suite revision and enqueues one request. It returns
immediately with `schemaVersion: 1`, `id`, `status: "queued"`, and `studioUrl`
(null when the connection has no browser URL). Success means the request was
accepted, not that its cases passed. A changed suite returns HTTP 409; no retry
or second run is performed automatically. Refresh discovery and retry explicitly.

> **Good to know:** A queued response means Studio accepted the request. Check the eventual [saved result](/docs/studio/evaluation-results) before calling it a pass; [automation](/docs/cli/evaluation-automation) can enqueue work without waiting for grades.

## Inspect and cancel

Runs started through the CLI default to the configured Studio judge. Add
`--judge app` to use the consumer's code judge. The API records the selected judge
and its version; missing configuration fails before enqueuing, without fallback.

```sh
pnpm exec kortyx studio evals runs list --connection staging --json
pnpm exec kortyx studio evals runs get RUN_UUID --connection staging --json
pnpm exec kortyx studio evals runs get \
  https://studio.example.com/evals/runs/RUN_UUID --json
pnpm exec kortyx studio evals runs cancel RUN_UUID --connection staging --json
```

History returns the latest 100 records in the project before the CLI applies an
environment filter. Run detail includes counts, case/step statuses and criterion
IDs/verdicts. Suite definitions, observations, reference facts and grade reasoning
require `--include-content`. Recognizable credentials and resume tokens remain
redacted on a best-effort basis, including when content is requested.

Pasted URLs must match a configured connection; redirects are not followed.
Cancellation is cooperative and does not roll back application side effects.
A run may finish before cancellation arrives. Inspect its final saved status.

Next: [Automate evaluations after deployment](/docs/cli/evaluation-automation).


## Bounded saved-evaluation investigation

Deploy the Studio API with inspection protocol 1 before upgrading CLI readers.
`studio doctor` reports `evalRead` capabilities separately from context/API
connectivity. An unsupported server produces an explicit compatibility error;
readers never fall back to downloading a complete evaluation.

```bash
kortyx studio inspect https://studio.example/evals/evaluations/EVALUATION_ID --connection staging --json
kortyx studio evals attempts EVALUATION_ID --status error --limit 25 --connection staging --json
kortyx studio evals attempts EVALUATION_ID --status failed --limit 25 --connection staging --json
kortyx studio evals turn EVALUATION_ID --suite SUITE_RUN_ID --case CASE_ID --repetition 1 --turn 0 --connection staging --json
kortyx studio evals evidence EVALUATION_ID --suite SUITE_RUN_ID --case CASE_ID --repetition 1 --turn 0 --section criteria --include-content --connection staging --json
kortyx studio evals compare FIRST_EVALUATION_ID SECOND_EVALUATION_ID --connection staging --json
```

`runs get` and `overview` read small summaries, counts, recorded settings,
identity/context metadata and a capped failure inventory. `--include-content`
does not download every conversation. `attempts` filters by suite, case, status,
failure phase and repetition before transmission. Pages include available,
returned and omitted counts, continuation cursors, and expansion commands that
retain the selected connection. Attempt pages default to 25 and cap at 100.

`turn` returns saved verdict identifiers and runtime/diagnostic links without
conversation content. `evidence` requires `--include-content` and selects one of
`input`, `expectation`, `observation`, `criteria`, `verification`, `tools`,
`output`, `interrupt`, `model`, `diagnostic` or `context`. Missing capture is
explicit. Active turns may not yet have saved evidence. Model evidence first
lists captured runtime event IDs; `--event UUID` expands one event. Retained
private diagnostics remain behind the existing `studio diagnostics` reader and
its `diagnostics:read` permission.

Evidence is returned as JSON text fragments, with Unicode-character offsets and
lengths. `--content-cursor` continues a fragment; `--content-limit` defaults to
8,000 characters and caps at 32,768. Credentials are redacted on the server
before slicing. Reassemble fragments before JSON parsing. `--output PATH` exports
the current page into a new owner-only file (0600), refuses overwrite, and never
starts an execution. Response safeguards remain: 512 KiB per inspection page and
the existing 20 MiB transport ceiling. Reduce page/content limits if necessary.

`compare` reuses bounded context/fixture fingerprints and recorded deployment,
judge and settings facts; it returns the first changed fields without fetching
transcripts. It does not invent missing historical model/prompt information.
Schema mismatch errors include safe field paths, issue codes, request IDs and
client/server versions, with received values omitted.
