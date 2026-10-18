---
id: "v0-self-hosting-configure-evaluations"
title: "Configure evaluation services"
description: "Register application endpoints and judge credentials on a self-hosted Studio API, then verify discovery and execute a test case."
keywords: ["kortyx", "self-hosting", "configure", "evaluations"]
sidebar_label: "Configure evaluation services"
section: "deploy"
---
# Configure evaluation services

This configuration belongs to the self-hosted API service. In managed Cloud, use [evaluation connections](/docs/cloud/evaluations) instead. First expose your application's authenticated endpoint using [the first-evaluation tutorial](/docs/studio/first-eval).

For planned deployments, choose a worker topology and [retire evaluation workers](/docs/self-hosting/deployment-lifecycle) before replacing services. Removing a target or seeing an empty queue does not confirm that active evaluations have finished.

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
OSS bootstrap grants execution permission by default. Existing installations
should rerun bootstrap with the same stored keys and pepper. A registered
consumer target and a configured Studio or App judge are still required.

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

Studio-triggered runs use the project judge default, or **Studio judge** when unset. Configure its model and provider
key on the Studio **API backend**. A code judge provided to `createEvals` makes
**App judge** available for run overrides and project defaults. If hosted judging is not configured, the run drawer explains what is missing
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

> **Good to know:** The app endpoint credential and the judge provider key serve different requests. Review [credential roles](/docs/self-hosting/credentials-secrets#credential-roles) when discovery succeeds but [execution or judging fails](/docs/studio/judging#read-a-verdict).

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

See [Conversation Evals](/docs/sdk/guides/conversation-evals) for suite design,
typed setup/responders, Auth0 integration and grading boundaries.

Next: [Run and verify an evaluation](/docs/studio/first-eval#7-run-and-verify-the-actual-workflow).
