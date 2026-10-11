---
id: v0-studio-first-eval
title: "Run Your First Workflow Eval"
description: "Wire an existing agent to Studio, configure the right services, diagnose setup failures and verify a real suite."
keywords: [kortyx, evals, onboarding, setup, doctor, authentication, deployment]
sidebar_label: "First Workflow Eval"
section: "guides"
---
# Run your first workflow eval

Start here if you already have a working Kortyx agent and want to run a suite
from Studio. This recipe uses your existing agent and its normal model/tool
configuration. You will create two application files, mount one endpoint, and
configure the Studio API. No suite publication job is required.

For a standalone starting point, run the [catalog endpoint example](https://github.com/kortyx-io/kortyx/tree/main/examples/kortyx-eval-endpoint). It contains a real model/tool workflow, suite, HTTP server and optional local judge. The fixture verifies wiring; use your own permission path for application acceptance.

The execution path is **Studio → Studio API → your application's eval endpoint
→ your existing agent → judge → saved result**. Deploying Studio alone does not
mount or enable the application endpoint.

## 1. Define one case

Create `src/evals/suites.ts` in your application:

```ts
import { defineSuite } from "kortyx";

export const catalogSmoke = defineSuite({
  id: "catalog-smoke",
  name: "Catalog lookup",
  cases: [{
    id: "blue-backpack-price",
    name: "Read a product price",
    // Use the ID of an existing, registered workflow in your application.
    workflowId: "catalog",
    steps: [{
      message: "What is the price of the blue backpack in my catalog?",
      expect: {
        type: "answer",
        criteria: [
          "Looks up the blue backpack using a successful catalog tool call and reports its price and currency faithfully. Fails if the product is missing or no successful lookup evidence is available.",
        ],
      },
    }],
  }],
});
```

Choose a product your test account can actually read. Author the scenario from
known data; do not discover random products during startup. A suite is JSON data,
not authentication code. Add more cases to this array as you learn about failures.

For this criterion, enable evidence on the workflow's existing `useReason` call:

```ts
const result = await useReason({
  model,
  input,
  tools,
  toolExecution: { emit: true },
});
```

Without emitted tool results the judge cannot establish that the reported price
came from the lookup. This flag captures evidence; normal agent telemetry is
configured separately if you want workflow costs and workflow inspection links.

## 2. Create the eval instance beside your agent

Create `src/evals/index.ts`. Export the eval instance without starting a server:

```ts
import { createEvals } from "kortyx";
import { agent } from "../agent"; // Your existing createAgent instance.
import { catalogSmoke } from "./suites";

export const evals = createEvals({
  agent,
  suites: [catalogSmoke],
});
```

This minimal instance is sufficient when your workflow needs no caller-specific
context. If your tools depend on an authenticated user, add `setup` and `execute`
**before running it**:

```ts
import { authenticateTestActor, withApplicationRequest } from "../auth";

export const evals = createEvals({
  agent,
  suites: [catalogSmoke],
  setup: async ({ signal }) => authenticateTestActor({ signal }),
  execute: async ({ prepared, history, sessionId, command, signal, run }) =>
    withApplicationRequest(
      { actor: prepared, sessionId, history, command, signal },
      () => run({ context: { userId: prepared.userId } }),
    ),
});
```

`authenticateTestActor` and `withApplicationRequest` above are your application's
existing helpers, not Kortyx exports. The first obtains a test identity; the
second binds the same permission checks, request-scoped tools and context that
ordinary requests use. Adapt their arguments to your app. Reuse that existing
logic rather than implement a second permission system for evals.

Configure the test account in the **application service**. It may use a username
and password, a refreshable token, or another identity mechanism your app already
supports. Studio neither obtains that token nor assigns the account's roles.
The eval service key authorizes initiation; it does not grant domain data access.
Never put user tokens or passwords in suite definitions, progress or judge inputs.

Add teardown only if setup acquires resources that need releasing. It is not
necessarily a sign-out operation. See [application authentication and execution](../../sdk/v0/03-guides/10-conversation-evals.md)
for cancellation, typed callbacks and interrupt responders.

## 3. Mount and deploy the application endpoint

For **Next.js App Router**, create `src/app/api/evals/route.ts`:

```ts
import { createEvalRouteHandler } from "kortyx";
import { evals } from "../../../evals";

const serviceKey = process.env.EVAL_SERVICE_KEY;
if (!serviceKey) throw new Error("EVAL_SERVICE_KEY is required");
const handleEvals = createEvalRouteHandler({ evals, serviceKey });

export const runtime = "nodejs";
export const GET = handleEvals;
export const POST = handleEvals;
```

Its URL is `https://your-app.example/api/evals`. Keep a single handler instance
so its per-process active-run limit is shared across requests.

For a **Hono Node server**, mount the same Web handler before starting the server:

```ts
import { createEvalRouteHandler } from "kortyx";
import { evals } from "./evals";

const serviceKey = process.env.EVAL_SERVICE_KEY;
if (!serviceKey) throw new Error("EVAL_SERVICE_KEY is required");
const handleEvals = createEvalRouteHandler({ evals, serviceKey });
app.on(["GET", "POST"], "/api/evals", (c) => handleEvals(c.req.raw));
```

For **Express/Fastify or another Node server**, use the framework's Web Request/
Response bridge. It must preserve the request abort signal, stream the returned
body, and cancel its reader when the client disconnects. Do not buffer the full
POST response or redirect it through the interactive chat route. See the
[runnable Node adapter](https://github.com/kortyx-io/kortyx/tree/main/examples/kortyx-eval-endpoint)
for a complete application using Hono's Node server bridge.

Generate a separate service key, store it privately, and supply it to the app:

```sh
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

The HTTP route explicitly reads `EVAL_SERVICE_KEY`; the local eval module does not need it. **Kortyx does not automatically
read application env variables or enable routes.** If your application has its
own eval feature flag, enable it in the deployed application. Ensure the server
and reverse proxy expose the exact GET/POST path in the target configuration.

Restart/deploy the app with its service key, test-account configuration and normal
workflow model/tool configuration. A healthy container does not prove that the
route was registered.

## 4. Register the application on Studio

On the **Studio API backend**, mount a private JSON file:

```json
[
  {
    "id": "catalog",
    "name": "Catalog agent",
    "organizationId": "YOUR-EXISTING-ORGANIZATION-UUID",
    "projectId": "YOUR-EXISTING-PROJECT-UUID",
    "environment": "development",
    "url": "https://your-app.example/api/evals",
    "serviceKey": "THE-SAME-KEY-AS-THE-CONSUMER"
  }
]
```

Use the existing Studio organization and project IDs. The environment must be
allowed in that project; use its real configured label rather than infer one
from the hostname. The application filter gets its ID/name from this file.

For Compose, apply this override alongside your installation's normal stack:

```yaml
services:
  api:
    environment:
      KORTYX_EVAL_TARGETS_FILE: /run/secrets/eval-targets.json
    volumes:
      - ./private/eval-targets.json:/run/secrets/eval-targets.json:ro
  db-init:
    environment:
      KORTYX_STUDIO_ENABLE_EVALS: "1"
```

Keep the target file and env files out of Git and restrict their filesystem
permissions. Rerun the existing bootstrap job with the **same stored Studio key**
to grant `eval:run`, preserving its key and pepper. Run the release's normal
database migrations, then restart the API to load target changes. Hosted systems
use their normal secret mounts and bootstrap process; a host `.env` value alone
does not create a container mount.

For an app running on your host with Studio in Docker Desktop, use
`http://host.docker.internal:YOUR-APP-PORT/api/evals` and
`"allowInsecureHttp": true` on that target. Remote deployments use HTTPS.
`localhost` inside the API container points to that container.

Studio fetches the registered suites through authenticated **GET** discovery.
It does not receive suites through `kortyx topology push`. Changing code-authored
suites requires deploying the application and refreshing discovery.

## 5. Configure one judge

This recipe selects **Studio judge**. Configure these on the **Studio API** and
restart it:

```dotenv
KORTYX_EVAL_JUDGE_BASE_URL=https://openrouter.ai/api/v1
KORTYX_EVAL_JUDGE_API=chat-completions
KORTYX_EVAL_JUDGE_MODEL=openai/gpt-4o
KORTYX_EVAL_JUDGE_API_KEY=<private OpenRouter key>
```

Choose a model/provider route supporting structured JSON verdicts. The browser
and consumer do not receive this key. This model grades execution; it does not
replace your workflow model. You can instead configure an App judge with
`createEvalJudge` and explicitly select it in Studio or with `--judge app`.
See [judge selection](./11-evals.md#studio-judge-configuration).

### Configuration belongs to different services

| Setting | Owner | Required when | Apply changes |
| --- | --- | --- | --- |
| `EVAL_SERVICE_KEY` in this example | Application | Exposing the eval handler; explicitly passed to it | Restart/deploy app |
| App's own eval enable flag, if present | Application | App gates route registration | Restart/deploy app |
| App test-account/token settings | Application | Workflow requires user permissions | Restart app or follow its token refresh mechanism |
| Workflow model/tool settings | Application | Existing agent needs them | Follow app configuration |
| `KORTYX_EVAL_TARGETS_FILE` and its read-only file mount | Studio API | Discovering/executing consumer suites | Restart API |
| Target `serviceKey` | Private target file | Must match the application handler's key | Restart API; coordinate app rotation |
| `KORTYX_STUDIO_ENABLE_EVALS=1` | Bootstrap job | Granting `eval:run` to the existing local project key | Rerun bootstrap with stored key |
| Existing `KORTYX_STUDIO_API_KEY` | Studio server | Browser proxy needs `studio:read` and `eval:run` | Restart Studio server if its key changes |
| `KORTYX_EVAL_JUDGE_MODEL`, `KORTYX_EVAL_JUDGE_API_KEY` | Studio API | Selecting Studio judge | Restart API |
| `KORTYX_EVAL_JUDGE_BASE_URL`, `KORTYX_EVAL_JUDGE_API` | Studio API | Using OpenRouter or a compatible endpoint | Restart API |
| Variable named by CLI `--api-key-env` | Developer terminal / CI | Connecting the CLI to Studio | Set before invoking CLI |

The CLI uses a **Studio project key**, not the application service key or an LLM
provider key. Preserve the existing database URL and API-key pepper. The
[configuration reference](./08-configuration-reference.md) lists all defaults,
optional judge ID/version overrides and existing Studio authentication settings.

## 6. Diagnose setup before executing

Use the CLI from the release containing the doctor command. Connect it to the
Studio **API URL**, not the browser's URL:

```sh
# KORTYX_PROJECT_KEY holds the existing project Studio key in your private environment.
pnpm exec kortyx studio evals doctor \
  --api-url https://studio-api.example.com \
  --api-key-env KORTYX_PROJECT_KEY \
  --target catalog --environment development --suite catalog-smoke
```

For a configured connection, use `--connection staging` instead of the direct
URL/key flags. The connection's default environment applies unless overridden.

Example when the consumer route is missing:

```text
Kortyx Evals · Setup check
  ✓ Authenticated Studio discovery (studio:read).
  ✓ Studio key has eval:run.
  ✓ 1 matching application target(s).
  ✓ catalog (development): target environment allowed.
  ✗ catalog (development): Application endpoint returned HTTP 404. (HTTP 404)
    → Ensure the eval route is mounted and enabled in the deployed application; check the target URL and reverse proxy route.
  – catalog (development): judge compatibility cannot be checked without a manifest.
```

Doctor checks project read/execution access, matching targets, environment access,
authenticated manifest validity, registered suites and advertised judge support.
It starts **no workflows, judge calls or saved eval runs**. The consumer's GET
wrapper may perform its own authentication; the SDK's manifest handler does not
call `setup`. Provider credentials, test-user tool permissions and worker health
still need a real run. An older Studio API may return only “unavailable”; doctor
reports that limitation rather than invent a cause.

`--judge app` checks the code judge instead; `--json` returns one report with
`schemaVersion`, `status` and `checks`. Each check has `id`, `status`, `message`
and an optional `remedy`. Exit `0` means all configuration checks passed; exit
`1` means a failure. Failed prerequisites produce skipped downstream checks.
Doctor uses discovery GET only; do not use it as a provider-token validation test.

## 7. Run and verify the actual workflow

Open **Evals → Suites**, refresh, and choose **Catalog lookup**. Select Studio
judge and run the one case once. Or enqueue through the same configured API:

```sh
pnpm exec kortyx studio evals runs start catalog-smoke \
  --api-url https://studio-api.example.com \
  --api-key-env KORTYX_PROJECT_KEY \
  --target catalog --environment development --judge studio
```

The command returns a run ID immediately. Inspect it in Studio, or with
`kortyx studio evals runs get <run-id>` using the same connection flags.
An enqueue response confirms a queued record, not a completed eval.

Before calling the integration complete, verify:

- The real deployed suite is visible, not merely an application connection label.
- The test actor reaches the normal tools with its intended roles and data access.
- The workflow runs, the selected judge grades it, and the final reasons/evidence are readable.
- Reloading the run retains its definition, observations and final result.
- Live progress arrives; workflow/judge costs appear when their usage is recorded.
- Cancelling a suitable test run reaches a saved terminal state and honors cleanup.

A behavioral failure can be a useful successful integration test: inspect the
reason rather than weaken criteria to obtain a green result. Authentication,
provider or execution errors need resolving before assessing behavior. Use a
representative read-only case for onboarding; a passing fixture alone does not
prove your real application's permissions or domain logic.

Once this works, add [interrupt scenarios and required structured outputs](../../sdk/v0/03-guides/10-conversation-evals.md),
[local terminal execution](./04-cli-commands.md#run-locally-without-studio), or
[optional post-deployment CI triggering](./04-cli-commands.md#eval-suites-and-post-deployment-ci).
Keep CI triggering after application deployment/readiness; it need not block releases.
