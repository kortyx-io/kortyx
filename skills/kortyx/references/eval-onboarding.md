# First workflow eval: integration and deployment

Use this reference when adding evals to an existing application or deploying its
first Studio integration. The complete public recipe is
[Run Your First Workflow Eval](https://kortyx.io/docs/studio/first-eval).
Read [conversation-evals.md](conversation-evals.md) for callback/API details and
[studio-evals-and-ci.md](studio-evals-and-ci.md) for infrastructure and CLI options.
Do not assume the installed CLI supports doctor; inspect `kortyx studio evals --help`
and use matching SDK/Studio releases.

## Establish the actual application path

Find the existing `createAgent` instance, registered workflow IDs, HTTP routes,
authentication helper, permission/tool request binding, and deployment configuration.
Suites describe scenarios; they do not implement authentication. Create a standalone
`createEvals({ agent, suites })` instance and reuse those application helpers through
`setup`/`execute` when caller context is needed. Do not start a second HTTP server
when a local CLI entry imports the eval instance.

A minimal module looks like:

```ts
import { createEvals, defineSuite } from "kortyx";
import { agent } from "../agent";

const smoke = defineSuite({
  id: "catalog-smoke",
  cases: [{
    id: "price",
    workflowId: "catalog", // Existing registered workflow.
    steps: [{
      message: "What is the price of the blue backpack?",
      expect: {
        type: "answer",
        criteria: ["Uses a successful catalog lookup and reports the product's price and currency faithfully."],
      },
    }],
  }],
});
export const evals = createEvals({ agent, suites: [smoke] });
```

Bind the application's normal test identity/context before running private tools.
Enable `toolExecution.emit: true` on relevant `useReason` calls when grading tool
activity or retrieved facts. A direct local semantic run needs an app judge;
Studio runs can select its backend judge instead. Keep actor/provider credentials
out of suite JSON and public stream evidence.

## Wire both deployed services

Mount one `createEvalRouteHandler({ evals, serviceKey })` instance in the consumer,
with GET manifest discovery and streaming POST execution. Next.js can export it
as GET/POST on a Node route; Hono can call it with `c.req.raw`. Other server bridges
must preserve cancellation and stream the returned body. The runnable source
example is `examples/kortyx-eval-endpoint/` in the public Kortyx repository.

Deployment configuration has separate owners:

| Setting | Owner | Required action |
| --- | --- | --- |
| Handler service key, >=32 characters | Consumer and private Studio target | Same value on both sides; passed explicitly to the SDK handler |
| Test-account/token configuration | Consumer setup/execute | Use the app's supported auth path and intended roles; restart/refresh as appropriate |
| Any app-specific eval enable flag | Consumer deployment | Enable route registration if the application gates it; no universal Kortyx flag exists |
| Workflow models/tools | Consumer | Preserve normal application configuration |
| `KORTYX_EVAL_TARGETS_FILE` and its read-only file mount | Studio API | Register exact endpoint URL, existing org/project IDs and allowed environment; restart API |
| `KORTYX_STUDIO_ENABLE_EVALS=1` | Existing bootstrap job | Grant execution scope with the stored Studio key and pepper |
| `KORTYX_STUDIO_API_KEY` | Studio server proxy | Existing project key needs `studio:read` and `eval:run` |
| `KORTYX_EVAL_JUDGE_MODEL` / `KORTYX_EVAL_JUDGE_API_KEY` | Studio API | Configure when selecting Studio judge; restart API |
| Judge base URL / API mode | Studio API | OpenRouter: `https://openrouter.ai/api/v1`, `chat-completions` |
| CLI project key variable | Developer/CI connection | Studio project key, not consumer service key or provider key |

`EVAL_SERVICE_KEY` is an example consumer env name, not a variable read by Kortyx.
Do not introduce account env names or auth flows into an unrelated app unless
needed by its integration. Inspect its actual startup code and infrastructure.
Configuring Studio alone does not deploy, mount or enable the consumer route.
Adding a host env variable alone does not mount a private file in a container.
Use `host.docker.internal` for a host app from Docker Desktop, with explicit
`allowInsecureHttp: true` for local HTTP; remote targets use HTTPS.

Suites are fetched from the consumer's authenticated manifest. They are not
published by `kortyx topology push`; code-authored changes need consumer deployment
and refreshed discovery. Match the target's environment to the configured Studio
project label, not an inferred hostname label.

## Diagnose, then verify

```sh
kortyx studio evals doctor --connection staging \
  --target catalog --environment staging --suite catalog-smoke
```

Use direct `--api-url` plus `--api-key-env` instead of `--connection` if needed.
Doctor uses discovery GET; it starts no workflows or model calls, although an
app's GET wrapper may authenticate its own test actor. It checks Studio access,
execution permission, target/environment, authenticated manifest/suites and
advertised judge compatibility. Use `--judge app` for the code judge or `--json`
for one versioned report. Exit 1 means failed setup; failed prerequisites skip
checks that cannot be established. Older APIs may lack detailed failure categories.
A configured judge does not prove its provider token works.

- HTTP 404 from consumer: check deployed route mounting, app enable flag, URL and proxy.
- HTTP 401/403 from consumer: check the matching service key and any app-specific actor authentication during GET; do not automatically rotate the Studio key.
- Environment denied: fix project/target environment access before testing consumer credentials.
- Unreachable: test the path from the Studio API network, including TLS/DNS and redirects.
- Invalid manifest: check SDK compatibility or HTML/login responses from a proxy.

After configuration checks pass, execute a representative suite through Studio
or `kortyx studio evals runs start`. A queued ID or healthy ECS/Docker task is not
proof of completion. Before declaring the requested integration finished, record
the deployed target/environment, suite and completed run ID, selected judge,
actual tool/identity path and saved result. Confirm reload persistence and live
updates; verify costs when telemetry/usage is configured. For cancellation work,
verify a terminal saved state and cooperative cleanup with a suitable test case.
Do not replay side-effecting workflows solely to satisfy a checklist without
checking the user's authorized scope.

A behavioral failure with correct evidence may demonstrate that integration
works while exposing an application issue. Resolve authentication/provider/
execution errors separately; do not relax criteria to manufacture a pass.
Distinguish a fixture wiring test from representative domain acceptance.

## Source references

- `packages/agent/src/evals/route-handler.ts`: authenticated GET/POST and streaming/cancellation contract.
- `apps/api/src/evals/targets.ts`, `apps/api/src/routes/evals.ts`: safe discovery diagnostics, tenant/environment checks.
- `packages/cli/src/studio/eval-doctor.ts`, `eval-command.ts`: checks, remediation, selection and reporting.
- `examples/kortyx-eval-endpoint/src/`: runnable public fixture, suite and server mount.
