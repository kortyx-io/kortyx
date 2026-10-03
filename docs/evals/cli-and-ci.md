# Eval suites from the CLI and CI

`kortyx evals run` executes locally; `kortyx studio evals` operates saved Studio runs.

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

The CLI loads `.env.local` and `.env` from the current working directory before
importing the entry; existing shell variables take precedence. Run the script from
the application directory. Model credentials remain application-owned, for example
`OPENROUTER_API_KEY` for an OpenRouter app judge. Studio's judge settings are not
used by this command.

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

## Run through Studio

The Studio commands use the same Studio API, project scopes, application targets, worker,
and PostgreSQL records as the browser. It does not import your agent or obtain
an end-user token. The application handles its test actor in `createEvals.setup`.

Configure the [consumer endpoint and Studio targets](./studio-execution.md) first.
Your connection key needs `studio:read` for discovery and result inspection, plus
`eval:run` for starting and cancelling. The SDK telemetry write key cannot run evals.
The application's eval service key stays on the Studio API server.

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
20 repetitions, concurrency 4, and 100 total attempts per queued run.

Start discovers the current suite revision and enqueues one request. It returns
immediately with `schemaVersion: 1`, `id`, `status: "queued"`, and `studioUrl`
(null when the connection has no browser URL). Success means the request was
accepted, not that its cases passed. A changed suite returns HTTP 409; no retry
or second run is performed automatically. Refresh discovery and retry explicitly.

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

## Optional post-deployment GitHub Actions step

Install and pin `kortyx` or `@kortyx/cli` in the application's lockfile. After your
existing deployment and readiness check, enqueue a suite:

```yaml
- name: Start conversation evals
  continue-on-error: true
  env:
    KORTYX_DEPLOY_EVAL_KEY: ${{ secrets.KORTYX_DEPLOY_EVAL_KEY }}
  run: >-
    pnpm exec kortyx studio evals runs start product-ambiguity
    --target catalog --environment staging
    --api-url https://api.example.com
    --api-key-env KORTYX_DEPLOY_EVAL_KEY
    --json
```

This step returns after enqueueing and does not wait for grades or gate the
deployment. Inspect results in Studio or with `runs get`. Ensure the CI runner can
reach the Studio API, and the Studio API can reach the deployed consumer endpoint.
Use a key scoped to the intended project with `studio:read` and `eval:run`.
Each invocation creates a new run; your deployment workflow owns trigger frequency.
