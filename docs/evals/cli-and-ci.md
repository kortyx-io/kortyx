# Eval suites from the CLI and CI

The CLI uses the same Studio API, project scopes, application targets, worker,
and PostgreSQL records as the browser. It does not import your agent or obtain
an end-user token. The application handles its test actor in `createEvals.setup`.

Configure the [consumer endpoint and Studio targets](./studio-execution.md) first.
Your connection key needs `studio:read` for discovery and result inspection, plus
`eval:run` for starting and cancelling. The SDK telemetry write key cannot run evals.
The application's eval service key stays on the Studio API server.

## Discover and run

```sh
pnpm exec kortyx studio evals suites list --connection staging --json
pnpm exec kortyx studio evals suites get role-ambiguity \
  --connection staging --target hiring --include-content --json
pnpm exec kortyx studio evals runs start role-ambiguity \
  --connection staging --target hiring --case choose-barcelona \
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
20 repetitions, concurrency 4, and 100 total attempts per queued run.

Start discovers the current suite revision and enqueues one request. It returns
immediately with `schemaVersion: 1`, `id`, `status: "queued"`, and `studioUrl`
(null when the connection has no browser URL). Success means the request was
accepted, not that its cases passed. A changed suite returns HTTP 409; no retry
or second run is performed automatically. Refresh discovery and retry explicitly.

## Inspect and cancel

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

## Optional post-deployment GitHub Actions step

Install and pin `kortyx` or `@kortyx/cli` in the application's lockfile. After your
existing deployment and readiness check, enqueue a suite:

```yaml
- name: Start conversation evals
  continue-on-error: true
  env:
    KORTYX_DEPLOY_EVAL_KEY: ${{ secrets.KORTYX_DEPLOY_EVAL_KEY }}
  run: >-
    pnpm exec kortyx studio evals runs start role-ambiguity
    --target hiring --environment staging
    --api-url https://api.example.com
    --api-key-env KORTYX_DEPLOY_EVAL_KEY
    --json
```

This step returns after enqueueing and does not wait for grades or gate the
deployment. Inspect results in Studio or with `runs get`. Ensure the CI runner can
reach the Studio API, and the Studio API can reach the deployed consumer endpoint.
Use a key scoped to the intended project with `studio:read` and `eval:run`.
Each invocation creates a new run; your deployment workflow owns trigger frequency.
