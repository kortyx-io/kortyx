# Conversation evals in the consumer application

Use this reference to author eval suites or wire them around an existing Kortyx
agent. For Studio targets, model configuration, CLI and CI, read
[Studio evals and CI](studio-evals-and-ci.md).

## Check the version and execution boundary

Confirm the installed `kortyx` exports `createEvals`, `defineSuite`,
`createEvalJudge` and `createEvalRouteHandler`. Check provider versions separately;
provider selectors come from their provider packages. Do not assume an older
published SDK or Studio image supports these APIs or Studio judging.

A suite groups cases; a case scripts messages and expected human responses; a
run executes selected cases/repetitions; a judge scores semantic criteria. These
are new executions through the real application, not automatic grading or replay
of ordinary user sessions. Deterministic runtime behavior belongs in integration
tests; use eval criteria for ambiguity handling, grounding and task completion.

Keep one existing `createAgent` instance. The default executor consumes its
`streamChat` output and handles native resume metadata. Do not invent a new
agent constructor, duplicate workflows or call the application's own HTTP
endpoint just to enter the agent. Reuse app-owned request-context helpers in
`execute`. An HTTP adapter is an option when the application's execution boundary
requires it, not a requirement of the SDK.

## Start with explicit, serializable suites

Put suites in a module separate from setup and route registration. They contain
prompts, expected interaction types and criteria; they need no callbacks,
parameter schema or reference loader for ordinary tool-grounded conversations.

```ts
// evals/suites/catalog.ts
import { defineSuite } from "kortyx";

export const catalogSuite = defineSuite({
  id: "product-ambiguity",
  name: "Product information",
  cases: [{
    id: "choose-blue",
    name: "Clarify an ambiguous product, then describe it",
    steps: [
      {
        message: "Tell me about the Travel Backpack",
        expect: {
          type: "interrupt",
          schemaId: "app.product-picker",
          schemaVersion: "1",
          criteria: [
            "Offers both blue and black backpacks from successful tool results as distinct choices; does not select on the user's behalf.",
          ],
        },
      },
      {
        resume: { using: "chooseBlue" },
        expect: {
          type: "answer",
          criteria: [
            "Describes only the selected blue backpack, faithfully using its successful tool result. States when required details are unavailable.",
          ],
        },
      },
    ],
  }],
});
```

Each step has exactly one of `message` or `resume`. A message string is explicit
scenario input, not a template inferred from setup. A case may specify
`workflowId` to select a registered workflow. An unexpected answer instead of
the expected interrupt fails before semantic judging. Only demand ambiguity
when the scenario's available data deliberately contains it.

## Deterministic checks

Use built-in, serializable `expect.checks` for assertions that do not need a model:

```ts
import { defineSuite, evalChecks } from "kortyx";

const suite = defineSuite({
  id: "catalog-checks",
  cases: [{
    id: "blue-backpack",
    steps: [{
      message: "Show the blue backpack and its price in EUR",
      expect: {
        type: "answer",
        checks: [
          evalChecks.textContains("EUR"),
          evalChecks.textMatches("EUR\\s*49", "i"),
          evalChecks.toolCalled("catalog.lookup"),
          evalChecks.toolInputEquals("catalog.lookup", { sku: "blue-backpack" }),
          evalChecks.outputEquals({
            schemaId: "app.product-card",
            path: ["price"],
            value: 49,
          }),
        ],
        criteria: ["Describes the requested product faithfully using successful tool results."],
      },
    }],
  }],
});
```

No callback registry or additional `createEvals` option is required. Helpers return
plain descriptors such as `{ type: "tool-called", tool: "catalog.lookup" }`.
Up to 100 checks are allowed per step, and all must pass. Every evaluated check
saves its index, definition, pass/fail,
reason, and evidence in `step.checks`, separately from semantic `step.criteria`.
A failed check stops the case before reference loading and semantic judging;
cleanup still runs. Checks run in the application for both App and Studio judging.
Local SDK/CLI check-only suites need no judge. Studio retains its normal explicit
judge selection, but check-only steps make no semantic judge calls.

- `textEquals(value, { ignoreCase? }?)` compares the entire current answer as
  literal text. It is case-sensitive by default; for example,
  `textEquals("sales", { ignoreCase: true })` also accepts `"SALES"`. Whitespace
  is preserved, regex characters are literal, and an empty expected string is
  allowed. Case-insensitive comparison uses JavaScript `toLowerCase()`.
- `textContains(value)` is case-sensitive literal matching of current answer text.
- `textMatches(pattern, flags?)` uses a JavaScript regular expression expressed as
  strings, never a `RegExp` object. Invalid patterns/flags fail suite validation;
  patterns are limited to 1,000 characters. Author trusted patterns and avoid
  expensive expressions. A new expression is used for each attempt.
- `toolCalled(name)` requires a matching captured tool-call event. It establishes
  that a call was observed, not that it succeeded. `toolInputEquals(name, value)`
  requires a captured call-start event with exactly equal JSON arguments. Object
  key order is ignored; array order and scalar types are preserved.
- `outputEquals({ schemaId, schemaVersion?, path, value })` checks a current
  completed output envelope. `path` is relative to `data`, supports string keys
  and numeric array indexes, and is limited to 64 segments. `[]` checks the whole
  data value. Omitted versions accept any version. Missing properties do not
  equal `null`; partial, invalidated, and prior-turn outputs do not qualify.

Checks inspect the current step's full captured observation. Judge evidence
filters and history selection do not change their inputs. Enable
`toolExecution: { emit: true }` for tool assertions; missing evidence fails and
never establishes that an unobserved tool did not run. Silent calls and private
runtime state remain outside this boundary. Use semantic criteria for grounding
and successful task behavior; use the existing `verify` hook for final database
or other application-state postconditions.

Definitions and results are visible in Studio suite/case views and CLI JSON.
Keep secrets out of expected values and captured evidence. Deploy the compatible
Studio API, worker, Studio UI, and CLI before upgrading application SDKs that
expose checks. Older services reject unsupported descriptors; older saved suites
without checks remain readable. No database migration is required.

## Required structured outputs

Declare required completed output contracts on the step that must produce them:

```ts
const suite = defineSuite({
  id: "catalog-output",
  cases: [{
    id: "list-and-summary",
    steps: [{
      message: "Show the blue backpacks with prices and a short summary",
      expect: {
        type: "answer",
        outputs: [
          { schemaId: "app.product-list" },
          { schemaId: "app.product-summary", schemaVersion: "1" },
        ],
        criteria: ["Prices match successful tool results for the requested products."],
      },
    }],
  }],
});
```

Every listed contract must have a completed visible output in that step.
`schemaVersion` is optional: omitting it accepts any version; setting it requires
an exact match. Multiple outputs can appear in one assistant response. Extra
outputs are allowed, and this array does not assert their count or order.
The registered workflow's output contract validates the payload; eval criteria
judge its meaning and faithfulness to emitted tool results.

The runner checks the current finalized `observation.structured` envelopes before
calling either an app or Studio judge. Partial outputs, invalidated outputs,
outputs from earlier steps, tool results and IDs embedded inside a payload do not
satisfy a requirement. A missing contract fails the case with the missing ID and
version in the reason, skips semantic judging for that step and stops subsequent
steps. Cleanup still runs. Output-only expectations need no LLM judge in local
SDK runs; Studio runs still use its explicit judge selection flow.

Requirements appear in Studio's conversation plan and case evaluation, and are
saved with the run's suite snapshot. The same JSON shape works for a suite
authored in Studio, SDK execution and CLI-triggered runs.

`outputs` can also accompany an interrupt expectation when the workflow must
show data before requesting a response. The top-level `schemaId` and
`schemaVersion` on an interrupt expectation describe its single pending request;
`outputs` describes completed visible outputs. Use another step to resume it.
The default executor supports sequential interrupts, not simultaneous pending
requests.

A custom executor must put the current step's finalized public envelopes in
`observation.structured`, for example
`{ schemaId: "app.product-list", schemaVersion: "2", status: "done", data: { products: [] } }`.
Return partials with `status: "streaming"`, and remove invalidated entries.
Do not copy earlier turns or tool results into this array. The native executor
performs this accumulation automatically from `agent.streamChat`.

## Initialize evals and preserve permissions

```ts
// evals/index.ts
import { createEvals } from "kortyx";
import { z } from "zod";
import { agent } from "../agent";
import { obtainTestIdentity, withAuthorizedAgentRequest } from "../auth";
import { catalogSuite } from "./suites/catalog";

// Must match the real application's app.product-picker request contract.
const pickerRequest = z.object({
  products: z.array(z.object({ id: z.string(), color: z.string() })),
});

export const evals = createEvals({
  agent,
  suites: [catalogSuite],
  setup: async ({ signal }) => {
    // App-owned helper: obtains the configured test account's identity/token.
    const identity = await obtainTestIdentity(signal);
    return { identity };
  },
  execute: ({ prepared, run }) =>
    // The same authorization/request binding used by normal application traffic.
    withAuthorizedAgentRequest(prepared.identity, () =>
      run({ context: { userId: prepared.identity.userId } }),
    ),
  responders: {
    chooseBlue: {
      schemaId: "app.product-picker",
      schemaVersion: "1",
      respond: ({ interrupt }) => {
        const request = pickerRequest.parse(interrupt.request);
        const product = request.products.find((item) => item.color === "blue");
        if (!product) throw new Error("Expected product unavailable");
        // Must match the real interrupt response schema, not a Kortyx-wide shape.
        return {
          type: "value",
          value: { type: "select", productId: product.id },
        };
      },
    },
  },
  defaults: { caseTimeoutMs: 120_000, cleanupTimeoutMs: 10_000 },
});
```

`obtainTestIdentity` and `withAuthorizedAgentRequest` are application helpers,
not Kortyx exports. They must reuse the app's actual authorization and tool
binding; a token in setup alone does not grant tool access. Bind the request's
abort signal as well if normal tool execution requires it. `prepared` is inferred
from setup and stays private. `run({ context })` passes app-specific context to
the existing agent; `userId` is illustrative, not a universal permission field.
Without `execute`, setup does not automatically inject credentials or headers.

Setup is per case/repetition, not once per suite, with a new session ID. Optional
`teardown({ prepared, result, signal })` releases fixtures or resources after
successful setup, including failures/cancellation. It is not necessarily sign
out. Setup must clean up partially created resources when it fails before
returning. Honor signals in app callbacks; deadlines are cooperative.

A responder can use `interrupt.options` for built-in choices, or parse
`interrupt.request` using the real custom contract. Do not hardcode a production
resource ID or inspect private continuation tokens. Native responses are
`{ type: "text", text }`, `{ type: "select", ids }`,
`{ type: "value", value }` or `{ type: "cancel" }`. Named responders check their
schema descriptor before consuming a request. For custom contracts, the value
envelope contains the contract's validated response.

## Capture the evidence the judge needs

In relevant existing workflow `useReason` calls:

```ts
const result = await useReason({
  model,
  input,
  tools,
  toolExecution: { emit: true },
});
```

Tool emission defaults to off; the eval runner cannot enable it for the app.
The saved `observation.events` records ordered public stream evidence, including
emitted tool names/arguments/results/errors, text, structured output, interrupts
and workflow transitions. The judge receives the criterion, current input and
compact selected observation, optional reference, and (by default) earlier case
steps. Streaming noise and routine transitions are removed from judge input.
Earlier tool evidence remains available after resume when history is enabled.
Enable emission wherever a criterion needs retrieved facts.

Use criteria that say what must be grounded in successful tool results and what
to do when evidence is missing. Tool results establish what the workflow received,
not whether the external service is independently correct. Add optional inline
JSON `expect.reference` or named `references` only when independent expected
facts are necessary. A named reference uses `{ using: "handler", params? }`.

Silent calls, private workflow state, `done.data`, transition payloads and resume
tokens are outside the captured boundary. Emitted tool payloads and authored
inputs/references are intentionally visible to judges and stored results; keep
credentials out of those fields. Arbitrary tool data is not automatically redacted.

## Local judging and Studio selection

For direct SDK runs, add an optional app judge to the same `createEvals` options:

```ts
import { openrouter } from "@kortyx/openrouter";
import { createEvalJudge } from "kortyx";

const judge = createEvalJudge({
  model: openrouter("openai/gpt-4o"),
  id: "catalog-judge",
  version: "1",
});
// Include judge in createEvals({ agent, suites, setup, execute, responders, judge }).
const result = await evals.run({
  suiteId: catalogSuite.id,
  caseIds: ["choose-blue"],
  repetitions: 3,
  concurrency: 1,
});
```

Configure `OPENROUTER_API_KEY` on the application server for this provider. Choose
a model/provider route that supports structured JSON verdicts. Each criterion
gets a validated `{ passed, reason, evidence }`; all must pass. Calibrate the
judge against representative good/bad answers; avoid exact prose snapshots.

Direct SDK runs default to the app judge. Semantic criteria without an app judge
fail before setup/execution; interaction-only local cases need no judge. Studio
instead defaults to its backend judge even when an app judge exists. The user can
explicitly choose App judge. Missing configuration is an error, with no fallback.

App judging occurs per step and stops a case on semantic failure. Studio judging
captures the full scripted execution first; successful semantic steps remain
`ungraded` until Studio evaluates them, so semantic failure does not stop later
scripted steps. Interaction mismatches/execution errors still stop execution.
Judge ID/version/location are pinned and recorded; changing them after discovery
rejects a queued run before execution.

## Mount the eval endpoint once

```ts
// evals/route.ts
import { createEvalRouteHandler } from "kortyx";
import { evals } from "./index";

const serviceKey = process.env.EVAL_SERVICE_KEY;
if (!serviceKey) throw new Error("EVAL_SERVICE_KEY is required");

export const handleEvals = createEvalRouteHandler({ evals, serviceKey });
```

```ts
// app/api/evals/route.ts (Next.js App Router)
import { handleEvals } from "../../../evals/route"; // Adapt the local module path.

export const runtime = "nodejs";
export const GET = handleEvals;
export const POST = handleEvals;
```

This is a Web `Request` → `Response` handler. Other servers adapt their native
request/response types; there is no SDK `registerEvalRoutes(app, agent)` helper.
Reuse the handler instance so its active-run limit applies across requests.
The service key needs at least 32 characters. `GET` returns the public manifest;
`POST` validates the suite revision and streams NDJSON progress/final results.
Disconnect signals cancellation. Defaults are 100 total attempts and one active
run per handler instance; these limits are not a distributed application lock.
The service key protects eval initiation; it is distinct from the test user's
identity and the Studio project key.

## Optional typed parameters and custom execution

Keep the simple shape unless a case genuinely needs structured setup selection.
Optional `case.params` can select an app-configured test account or fixture.
Use `defineSuite<z.input<typeof paramsSchema>>` to check authored case values;
pass the Zod `paramsSchema` to `createEvals` for runtime validation. Setup sees
the parsed output type, including defaults/transforms. Suite data stays JSON;
setup/responders/references remain app callbacks. Do not put setup in `defineSuite`
or add a schema registry solely to combine multiple suites.

```ts
import { defineSuite } from "kortyx";
import { z } from "zod";

const paramsSchema = z.object({ actor: z.enum(["reader", "restricted-reader"]) });
const permissionSuite = defineSuite<z.input<typeof paramsSchema>>({
  id: "catalog-permissions",
  cases: [{
    id: "restricted-catalog",
    params: { actor: "restricted-reader" },
    steps: [{
      message: "Show the private product catalog",
      expect: { type: "answer", criteria: ["Explains access is unavailable without disclosing private products."] },
    }],
  }],
});
// createEvals({ agent, suites: [permissionSuite], paramsSchema,
//   setup: ({ params, signal }) => obtainTestIdentityForActor(params.actor, signal), ... })
```

One endpoint can serve several suites/accounts. Secrets are resolved inside the
app, not entered into suite params. Current Studio discovers code-registered
suites and executes them; browser authoring/editing of suites is not shipped.

Sequential interrupts (including child workflows) use native resume. Multiple
simultaneous pending interrupts and early response completion/background work
require app-owned `execute`. It receives `command`, `sessionId`, `history`,
`signal`, `prepared`, private `continuation` and the native `run` helper. Return
`{ observation, continuation? }`; interrupted execution needs a continuation.
Populate `observation.events` when bypassing the native stream. Await completion
or the intended human pause; own HTTP parsing, authorization and response mapping.

## Source and verification references

Paths are relative to a Kortyx source checkout. Installed consumers should use
the corresponding package exports and docs for their installed version.

- `packages/agent/src/evals/types.ts`: suite/step shapes, lifecycle callback
  contracts, observations, judging and run options.
- `packages/agent/src/evals/create-evals.ts`: setup, execution, resume, grading,
  isolation, deadlines and cleanup.
- `packages/agent/src/evals/output-expectations.ts`: completed output contract matching;
  `packages/agent/test/eval-output-expectations.test.ts`: partial, invalidated,
  missing, versioned and previous-turn output regressions.
- `apps/studio/e2e/eval-structured-outputs.spec.ts`: native workflow output
  contracts through consumer execution, persistence, drawers and direct reload.
- `packages/agent/src/evals/stream.ts` and `stream-evidence.ts`: native stream
  capture and the private/public boundary.
- `packages/agent/src/evals/define-suite.ts`, `judge.ts`, `route-handler.ts`:
  type-safe authoring, provider judging and authenticated consumer transport.
- `packages/agent/src/evals/index.ts`, `packages/kortyx/src/index.ts` and
  `packages/kortyx/src/evals.ts`: public imports.
- `packages/agent/test/eval-stream-evidence.test.ts`, `eval-route.test.ts`,
  `eval-judge-selection.test.ts` and `evals.test.ts`: working lifecycle/evidence
  regression cases; `packages/kortyx/test/evals.types.ts`: public typing checks.
- [Public conversation guide](https://kortyx.io/docs/guides/conversation-evals)
  and repository `docs/evals/sdk-runner.md`: expanded setup examples.

Verify a direct answer, deliberate ambiguity/resume, emitted tool-grounded answer
and restricted account through the real app before treating it as a useful
behavioral suite. Inspect saved observations and judge identity, not just the
overall green status. Account/data isolation and external side effects remain
application responsibilities.

## Judge criteria and evidence selection

Read [eval-criteria-and-evidence.md](eval-criteria-and-evidence.md) for complete
examples of application presentation rules, independent criteria, text-only
judging, suite/default overrides, and named predicates. Judges receive compact
execution evidence, not a rendering of the frontend. Describe which fields the
app displays as messages or prose and which stay internal in every relevant
criterion. Configure selection with `defaults.evidence` and `suite.evidence`;
full observations remain in Studio.

## Failure diagnostics and postconditions

Use `verify({ prepared, result, signal })` after the conversation and before
teardown for application postconditions. Return
`{ passed: false, reason: "Required save is absent", evidence: [] }` for unmet
behavior (Failed); throw for infrastructure faults (Error). Keep reset in teardown;
its errors remain Error. Verification does not overwrite earlier failed steps.

Eval issues preserve the original message, exception type, stack, causes and
provider/HTTP response properties in `errors[].exception` by default. Known
credential fields, authorization headers and credential patterns are redacted;
ordinary error content is retained. Capture size/depth limits are explicit in
`exception.capture`. No diagnostic flag or custom reporter is required for this
evidence. `errors[].failure` remains the separate public failure descriptor.

An existing native diagnostic reference is loaded automatically by Studio under
its project permissions. Optional `agent.reportError` or `createEvals({ reportError })`
can also archive evidence; exporter failure never changes the eval outcome.
Previously discarded content cannot be reconstructed. Progress listener failures
remain reporting errors and do not skip cleanup.

Setup and verification default to the configured case budget; cleanup defaults to
10 seconds. Verification and teardown remain separate. Upgrade API/Studio before
SDK/CLI for additive error fields; apply migration `0013_eval_settings` for
project defaults and structured termination. Old discarded content is unavailable.

## Concurrent execution recovery

New Studio negotiates `jobs-v1` with `createEvalRouteHandler`, scheduling each
case/repetition independently. Busy 429/503 admission uses bounded Retry-After
retries; accepted jobs reconnect by event cursor without rerunning the case.
Forward GET, POST and DELETE, including query strings and negotiation headers.
Keep long-running execution alive independently of the observer connection.
Explicit cancellation is cooperative and capacity remains occupied through cleanup.

The default `createInMemoryEvalExecutionStore()` handles one process. For replicas,
pass `createPostgresEvalExecutionStore({connectionString,namespace})` as
`executionStore`, with identical service keys, suite definitions and capacity
settings. Configure `maxActiveRuns` (1), `maxActiveAttempts` (20) and
`maxQueuedExecutions` (1000). Call store.setup() before traffic. For planned
retirement call handler.drain(), keep HTTP/store available for authenticated
observation and cancellation, then close HTTP, handler and store after observers
finish. handler.close() remains explicit abort. Drain rejects ambiguous admission,
claim or terminal persistence; do not treat that as successful retirement.
Matching jobs-v1 POST retries for known IDs reattach evidence during drain;
changed content returns 409. New IDs are refused without admission or replay.
With a single consumer, drain Studio workers first while the consumer still
accepts their later cases, wait for durable Studio outcomes, then drain the
consumer. With replicas, make a compatible replacement reachable first with the
same durable store/namespace, service key, suite revisions and capacity settings.
Consumer drain finishes its own active jobs and a bounded queued snapshot, not
future Studio cases or another owner's live jobs. The built-in memory/PostgreSQL
stores implement optional queued/claimQueued capabilities; old custom stores work
normally but drain fails until these atomic scoped capabilities are implemented.
Upgrade agent/runtime together; jobs-v1 and legacy wire formats are unchanged.
Queued jobs recover across restart; a lost running
lease becomes Unknown and is never automatically replayed. Inspect side effects
before explicit cancellation or a new run. Application nodes own external
idempotency; no data reducers or node/workflow shape changes are required.
Upgrade consumers before API/Studio; legacy consumers keep request-owned streams.
Verify hook availability in the installed build: published kortyx 0.32.0 / agent
0.39.0 / runtime 0.25.0 lack consumer drain. Use a later coordinated release that
includes it; never silently substitute aborting close when graceful drain is absent.

## Execution defaults and application limits

```ts
const evals = createEvals({
  agent,
  suites: [suite],
  defaults: {
    repetitions: 2,
    concurrency: 2,
    caseTimeoutMs: 120_000,
    gradingTimeoutMs: 60_000,
  },
  limits: { concurrency: 4, caseTimeoutMs: 300_000, gradingTimeoutMs: 120_000 },
});
// Direct SDK execution uses explicit run values, then configured SDK defaults.
await evals.run({ suiteId: suite.id, caseTimeoutMs: 180_000 });
```

Studio resolves each field as: per-run override → Studio project default →
installation default → explicit SDK default → SDK built-in default. Omitted values remain omitted until
resolution. The manifest's `execution` advertises declared defaults, limits and
supported overrides. Application limits are ceilings, independent of precedence;
an excessive value is rejected before setup, never silently clamped.

SDK built-ins are one repetition, concurrency one and a 60-second case timeout.
Repetitions and concurrency support 1–20; millisecond deadlines support positive
integers up to 2,147,483,647. Setup, verification and cleanup budgets remain
application-owned (`defaults.setupTimeoutMs`, `verificationTimeoutMs`,
`cleanupTimeoutMs`). Changing the per-run case deadline does not change these
independently resolved lifecycle budgets.

Grading has a separate 60-second built-in budget per step, shared across all of
that step's criteria. Configure `gradingTimeoutMs` through the same defaults,
limits and per-run overrides. Studio records the effective value and its source;
reruns preserve them. A shorter case/evaluation deadline or cancellation still
wins, and a verdict returned after the grading deadline is discarded. Older
consumers must advertise support before Studio sends an App-judge override.

The whole-evaluation deadline belongs to Studio scheduling, independently of the
SDK case budget. Studio defaults to 30 minutes across all selected suites,
including execution and Studio grading, starting when execution begins. Queue
waiting is excluded. Direct `evals.run` has no Studio scheduler deadline; callers
can pass `signal`. Aborts remain cooperative and cannot forcibly terminate work.

## Suite-owned judge prompts

Import a judge directly into `defineSuite({ judge })` when suites need different models or grading instructions. `createEvals({ judge })` remains a deprecated fallback until the next major release. Existing criteria, including application instruction wrappers, keep working.

Use `defineJudgePrompt` and `promptText` for portable templates:

```ts
import { createEvalJudge, defineJudgePrompt, defineSuite, promptText } from "kortyx";

const judgePrompt = defineJudgePrompt({
  id: "support/reporting-judge",
  messages: ({ criterion, input, observation, reference, conversation }) => [
    { role: "system", content: "Assess only the supplied criterion using verified evidence." },
    { role: "user", content: promptText`Criterion: ${criterion.text}
Input: ${input}
Observation: ${observation}
Reference: ${reference}
Earlier turns: ${conversation}` },
  ],
});
const reportingJudge = createEvalJudge({ model: reportingModel, prompt: judgePrompt });
const supportSuite = defineSuite({ id: "support", judge: reportingJudge, cases });
```

The callback receives typed symbolic references once at declaration time. Use the tag, not ordinary JavaScript interpolation. Kortyx serializes objects internally. The runtime injects only selected evidence after the suite’s history/event/output policy and filters; omitted reference facts become null and omitted history becomes an empty array. Earlier verdicts are excluded.

The serialized suite contains the judge identity and immutable prompt snapshot, never executable provider objects. Local App grading needs the original runtime binding; a deserialized suite must be rebound to an executable judge. Studio grading supports the portable template when its backend advertises `promptTemplates`. Upgrade SDK, API and CLI together before adopting templates. Studio suite/prompt authoring is a future surface, not an editor provided by this change.
