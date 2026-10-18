---
id: "v0-studio-first-eval"
title: "Run your first evaluation"
description: "Define one conversation, expose your application endpoint, connect it to Cloud or self-hosted Studio, and inspect the first saved result."
keywords: ["kortyx", "studio", "first", "eval"]
sidebar_label: "Run your first evaluation"
section: "evaluations"
---
# Run your first evaluation

You need a working Kortyx agent, access to its application server, and a Studio project. Use a read-only example your test account can complete. This walkthrough adds one case and an authenticated endpoint to that app.

The [runnable catalog endpoint example](https://github.com/kortyx-io/kortyx/tree/main/examples/kortyx-eval-endpoint) provides a complete starting point. Your application executes the workflow and its permission checks; Studio starts the test and saves its results.

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

```js
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

```js
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

```js
import { createEvals } from "kortyx";
import { agent } from "../agent.js"; // Your existing createAgent instance.
import { catalogSmoke } from "./suites.js";
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

```js
import { authenticateTestActor, withApplicationRequest } from "../auth.js";
export const evals = createEvals({
    agent,
    suites: [catalogSmoke],
    setup: async ({ signal }) => authenticateTestActor({ signal }),
    execute: async ({ prepared, history, sessionId, command, signal, run }) => withApplicationRequest({ actor: prepared, sessionId, history, command, signal }, () => run({ context: { userId: prepared.userId } })),
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
necessarily a sign-out operation. See [application authentication and execution](/docs/sdk/guides/conversation-evals)
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

```js
import { createEvalRouteHandler } from "kortyx";
import { evals } from "../../../evals.js";
const serviceKey = process.env.EVAL_SERVICE_KEY;
if (!serviceKey)
    throw new Error("EVAL_SERVICE_KEY is required");
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

```js
import { createEvalRouteHandler } from "kortyx";
import { evals } from "./evals.js";
const serviceKey = process.env.EVAL_SERVICE_KEY;
if (!serviceKey)
    throw new Error("EVAL_SERVICE_KEY is required");
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

In Cloud, open **Settings > Evaluations** for the intended project and register the deployed endpoint and its service key. Follow [Cloud evaluation connections](/docs/cloud/evaluations#application-endpoints).

For self-hosting, ask the operator to [register the application on the API service](/docs/self-hosting/configure-evaluations#register-applications-on-the-studio-api-server). This requires configuration on the API host, not your application host.

Refresh suite discovery in **Evals**. The **Catalog lookup** suite should appear. Publishing workflow topology does not register evaluation suites.

## 5. Configure one judge

Select **Studio judge** for this walkthrough. Cloud users connect a supported provider through **Settings > Providers**. Self-hosted operators configure the judge on their API service. Then choose a model that can return the structured verdicts your evaluation requires.

The judge's model checks the result. Your agent continues using its own application model. [Configure judging](/docs/studio/judging) explains the alternatives.

### Configuration belongs to different services

| Setting | Owner |
| --- | --- |
| `EVAL_SERVICE_KEY`, workflow models, tools, and test-user identity | Application server |
| Registered endpoint and matching service key | Cloud project Settings or self-hosted API |
| Studio judge provider and model | Cloud project Settings or self-hosted API |

## 6. Diagnose setup before executing

Refresh discovery and confirm the deployed suite appears under the intended application. If it does not, check the exact endpoint path, reachability, and service key. A 404 usually means the route is absent or the URL is wrong; a 401/403 needs an authentication check.

A discovered suite confirms the endpoint answered discovery. A real run is still needed to test the workflow, provider credentials, tools, and test-user access. Self-hosted connections can also use the [CLI setup checks](/docs/cli/evaluations#diagnose-deployment-wiring).

> **Good to know:** Discovery checks the connection; one real case checks execution. A successful conversation can still fail its [judge criteria](/docs/studio/judging), so inspect both parts of the [saved result](/docs/studio/evaluation-results).

## 7. Run and verify the actual workflow

Open **Evals**, select **Catalog lookup**, choose Studio judge, and run the case once. Wait for its saved final result. A queued record means Studio accepted the request; execution and judging happen afterward.

Open the case and read the answer, criterion verdict, and supporting evidence. Reload the page and confirm the saved result remains available. A quality failure can show that the integration works and the application needs improvement. An authentication, provider, or execution error needs resolving before you can assess answer quality.

Next: [Read and compare results](/docs/studio/evaluation-results) or [run evaluations directly in your terminal](/docs/cli/local-evaluations).
