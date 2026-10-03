# Studio eval execution, configuration and CI

Use this reference to register an application's eval endpoint, configure judging,
run suites from Studio/CLI, or enqueue a post-deployment suite. First wire the
consumer as described in [conversation evals](conversation-evals.md).

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
API caps repetitions at 20, concurrency at 4 and total attempts at 100.
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
flags with `--connection`/`KORTYX_CONNECTION`. Each invocation creates a run;
the deployment workflow owns trigger frequency and deduplication.

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
