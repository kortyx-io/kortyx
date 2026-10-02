---
id: v0-conversation-evals
title: "Evaluate Agent Conversations"
description: "Test real workflows with scripted conversations, human interrupts, app-owned permissions, and LLM grading."
keywords: [kortyx, evals, evaluation, workflow, interrupts, testing]
sidebar_label: "Conversation Evals"
---
# Conversation evals in the consumer application

`createEvals` runs scripted conversations against an existing `createAgent`
instance. A case sends messages, assesses the visible answer or interrupt,
resumes expected interrupts, and grades each criterion using a separate judge.
It executes real workflows, tools, and application logic.

The SDK exposes serializable suites, a manifest, progress events, and results.
Mount `createEvalRouteHandler` in the consumer app to let Studio execute suites
and persist their observations and grades. See [Studio execution](../05-studio/11-evals.md)
for the endpoint, database migration, and local Docker configuration.

## What an eval tests

A **case** is one use-case scenario: messages, expected answers or human pauses,
and the criteria that define success. A **suite** groups related cases. A **run**
executes selected cases, optionally several times. A **judge** grades the semantic
criteria using the captured conversation and execution evidence. A dataset in
other tools often serves the same role as a collection of cases; here a case can
contain an entire conversation rather than a single input/output pair.

These are scripted workflow evals. They do not automatically grade ordinary user
sessions. Production telemetry helps you find failures and author regression
cases; running those cases creates new executions. It does not replay a historical
session with its original permissions, data and side effects.

Keep deterministic SDK contracts in unit and integration tests. Use eval criteria
for behavior such as choosing the right resource, asking for clarification, and
using retrieved facts faithfully. A passing synthetic fixture verifies the eval
plumbing; verify representative scenarios through the real application's
execution and permission path before relying on their behavioral results.

## Smallest configuration

```ts
import { createEvals, createEvalJudge, defineSuite } from "kortyx";
import { agent } from "./agent";
import { judgeModel } from "./models"; // The app's configured ProviderModelRef.

const suite = defineSuite({
  id: "job-information",
  cases: [{
    id: "all-three-salaries",
    steps: [
      { message: "List my engineering jobs", expect: { type: "answer" } },
      {
        message: "Give me the salary ranges for all three of those jobs",
        expect: {
          type: "answer",
          criteria: [
            "Gives all three salary ranges and currencies accurately from successful tool results, attributed to the requested jobs; fails if the required job data is missing.",
            "Does not ask the user to choose just one job.",
          ],
        },
      },
    ],
  }],
});

const evals = createEvals({
  agent,
  suites: [suite],
  judge: createEvalJudge({ model: judgeModel }),
});

const result = await evals.run({
  suiteId: "job-information",
  repetitions: 3,
  concurrency: 1,
  onProgress: async (event) => {
    // Save or stream this public event in your application.
    console.log(event);
  },
});
console.log(result.status, result.counts);
```

This example grades answers against the workflow's emitted tool results, so it
needs no separate reference loader. Enable tool emission as shown below. Stable
fixtures make behavior changes meaningful; changing live data can change the
expected answer. An unexpected picker fails before calling the judge. Every
configured criterion must pass. Without criteria, only the interaction type and
optional interrupt schema are checked. Reference facts are optional; add them
only when the scenario needs an independent expected result beyond the tool
evidence.

## Execution evidence from existing tool outputs

For evals that check tool activity or ground answers in retrieved data, enable
`toolExecution.emit: true` on every relevant workflow `useReason` call:

```ts
const result = await useReason({
  model,
  input,
  tools,
  toolExecution: { emit: true },
});
```

The runner captures the existing public stream directly. Each step records ordered
`observation.events`: tool names, call IDs, arguments, results and errors, alongside
text, structured output, interrupt requests and workflow transitions. Adjacent
text deltas from the same source are joined. The judge receives the current
observation and all previous steps, including tool results retrieved before an
interrupt. This works from the SDK, Studio and CLI without querying Studio telemetry.

A criterion can say: “Answers for each requested job with the salary and currency
returned by its successful tool call; explicitly states when salary data is
missing.” No separate reference loader is needed for this check. The judge checks
faithfulness to the data the workflow actually received and can explain which
call or step caused a failure. It accepts any valid execution path that satisfies
the criterion. It cannot establish whether the external service itself is correct;
use fixed reference facts when you also need to check against an independent
expected result.

Tool emission defaults to off. Evals of answers or interrupts can still run without
tool evidence, but criteria that require retrieved facts need emitted results or
references. The eval runner cannot switch emission on for application workflows.
Silent calls and private runtime state are outside the captured boundary. A custom
executor must populate `observation.events` itself when it wants execution evidence.
Only emit tool arguments and results suitable for the judge and stored eval records;
they may contain application data, and arbitrary tool payloads are not automatically
redacted.

## Choose where judging runs

Workflow execution stays in the consumer application. Studio selects the judge
for each run, defaulting to **Studio judge**, even when the app provides a code
judge. The app needs no Studio model key or grading connection.

For Studio execution, no code judge is required:

```ts
import { createEvals } from "kortyx";

const evals = createEvals({ agent, suites: [suite], execute });
```

Provide a judge to enable direct local SDK runs and Studio's **App judge** option:

```ts
import { createEvals, createEvalJudge } from "kortyx";

const evals = createEvals({
  agent,
  suites: [suite],
  execute,
  judge: createEvalJudge({ model: judgeModel }),
});

// Uses the code judge. Studio is not required.
const result = await evals.run({ suiteId: suite.id });
```

The app judge accepts the same provider references as your workflows. For
example, with `@kortyx/openrouter` installed and `OPENROUTER_API_KEY` configured
on the application server:

```ts
import { openrouter } from "@kortyx/openrouter";
import { createEvalJudge } from "kortyx";

const judge = createEvalJudge({
  model: openrouter("openai/gpt-4o"),
  id: "job-information-judge",
  version: "1",
});
```

Choose a provider route that supports structured JSON verdicts. See the
[OpenRouter provider](../04-kortyx-providers/07-openrouter-provider.md) for explicit
provider settings. This is the App judge path; Studio judge credentials and its
OpenRouter-compatible endpoint are configured separately on the Studio API.

A direct local run with semantic criteria and no code judge fails before setup or
execution. Construction and suite discovery still work without a judge. Runs
with no semantic criteria can execute locally using only interaction checks.

When **Studio judge** is selected, the SDK bypasses the code judge, executes the
scripted conversation, resolves declared interrupts and runs cleanup. Interaction
mismatches and execution errors still stop the case. Successfully executed steps
with semantic criteria have `status: "ungraded"` and no criterion verdicts. Studio
then grades the captured evidence, records reasons and verdicts, and finishes the
run. A case is not counted as passed while awaiting evaluation. Semantic grading
happens after execution, so a semantic failure does not stop subsequent scripted
steps in this mode. **App judge** retains per-step grading and stop-on-failure.

Studio's run drawer offers both available locations. The CLI defaults to Studio
judging; pass `--judge app` to select the code judge. A missing judge or incompatible
consumer SDK prevents starting that selection; there is no automatic fallback.
The Studio backend pins the selected judge's ID and version when enqueuing. A
changed judge causes an error before execution. Saved results include the identity
and judging location for comparison.

Only captured public evidence is graded: criterion, input, observation, resolved
reference when configured, and previous steps. Auth tokens and private runtime
continuations stay in the app. Emitted tool payloads must be suitable for the
judge and stored records. See the Studio execution guide for backend model
configuration. Editing evaluator definitions in the browser and regrading saved
runs are outside this release.

For advanced direct SDK use, `createStudioEvalJudge({ url, apiKey, environment })`
is also available as an explicit code judge. It calls the Studio API and requires
a project key with `studio:read` and `eval:run`; this is not needed for ordinary
Studio-triggered runs.

## App-owned permissions and human responses

Keep suites as plain data and the application's authorization code in
`createEvals`. No parameter schema or reference loader is needed for this
example. The prompts name the scenario directly; the judge uses emitted tool
results as evidence.

```ts
import { createEvals, defineSuite } from "kortyx";

export const roleSuite = defineSuite({
  id: "role-ambiguity",
  name: "Role information",
  cases: [{
    id: "choose-barcelona",
    name: "Clarify an ambiguous role, then describe it",
    steps: [
      {
        message: "Bring me the AI Software Engineer role",
        expect: {
          type: "interrupt",
          schemaId: "app.role-picker",
          schemaVersion: "1",
          criteria: [
            "Offers both the Barcelona and Paris roles returned by successful tool calls as distinct choices, without selecting one on the user's behalf.",
          ],
        },
      },
      {
        resume: { using: "chooseBarcelona" },
        expect: {
          type: "answer",
          criteria: [
            "Describes the selected Barcelona role faithfully using its successful tool result.",
          ],
        },
      },
    ],
  }],
});

const evals = createEvals({
  agent,
  suites: [roleSuite],
  setup: async ({ signal }) => {
    // App-owned helper: obtains the configured test actor's credentials.
    const accessToken = await obtainTestUserToken(signal);
    return { accessToken };
  },
  execute: async ({ prepared, run }) => {
    // App-owned helper: the same identity and permission scope as normal requests.
    // Await run() inside the scope so request-bound tools retain authorization.
    return withAuthorizedAgentRequest(prepared.accessToken, () => run());
  },
  responders: {
    chooseBarcelona: {
      schemaId: "app.role-picker",
      schemaVersion: "1",
      // App-owned helper: reads the actual emitted picker request and returns
      // { type: "value", value: <your contract's validated selection> }.
      respond: ({ interrupt }) => selectRoleByCity(interrupt, "Barcelona"),
    },
  },
});
```

Configure the test actor and its accessible data in the app. This scenario assumes
both roles exist and are visible to that actor. If permissions or data expose only
one role, author a separate case with an answer expectation. The responder fails
if it cannot find the intended role in the actual choices; it must not invent a
resource ID. The application helpers above are not imports from Kortyx.

`setup` runs once per case repetition and returns private `prepared` state. The
runner passes it to `execute` and named handlers; it is not sent to Studio. Setup
can acquire an Auth0 token, prepare fixtures or bind a test identity. Kortyx does
not implement an Auth0 login flow. `execute` adapts each scripted command to the
app's normal execution boundary, including its permission and request context.
Reuse the same application helper that your chat/API route uses so the eval does
not bypass caller restrictions.

An Auth0 token alone does not configure permissions inside Kortyx. The app must
pass it through its existing authorization path. With no `execute`, the runner
calls `agent.streamChat` directly without injecting setup state or headers.
`run({ context })` consumes that same native stream; it adds the current command
and handles native resume metadata. It does not call an HTTP endpoint.

For an app-owned HTTP or typed execution API, replace `execute` with an adapter
that handles `command` (`message`, `resume`, or `cancel`), `history`, `sessionId`,
`signal`, and its private `continuation`. Return
`{ observation, continuation? }`. An interrupt observation needs a continuation
so the next command can resume or cancel it. Consume execution to completion or
the intended human pause before returning. HTTP response parsing, API auth,
and mapping app-owned UI actions remain the adapter's responsibility.

Native resume responses use `{ type: "text", text }`,
`{ type: "select", ids }`, `{ type: "value", value }`, or `{ type: "cancel" }`.
The `value` envelope contains the custom contract's actual response. Returning
the wrong contract value fails during native resume validation. A named
responder with a schema descriptor is checked before it consumes the request.
Named responders and references can also receive JSON arguments through
`{ using: "handlerName", params: { ... } }`.

`teardown` releases app resources; it need not sign out. It runs after successful
setup, including after failed expectations, cancellation, and errors. Setup
must clean up partially created resources if it throws before returning.

## Observable boundary and results

The default executor assesses finalized visible text, streamed execution events,
structured data, and one pending interrupt per step. Structured entries retain their public
stream envelope, including `dataType`, `data`, and status. The executor excludes
`done.data`, transition payloads and arbitrary interrupt transport metadata. Raw workflow state,
silent tools, private setup state, and resume tokens are not copied into eval
results or judge input. Run/checkpoint IDs connect observations to diagnostics
when the agent supplies them. Custom executor observations are validated.

References are independent facts from fixtures or application reads. An inline
JSON reference works too. Objects containing only `using` and optional `params`
are reserved for named reference handlers. The runner snapshots the resolved
reference alongside each observation. Do not put secrets in case params,
messages, emitted tool arguments/results, reference facts, custom observations, or responder values: these
fields are intentionally visible and serializable.

`createEvalJudge` invokes the separately configured provider model once per
criterion, requests a structured JSON verdict, and validates it. A verdict has
`passed`, `reason`, and `evidence`. A malformed, refused, or truncated verdict is
an error, not a failed behavior score. The model's judgments still need human
calibration against representative passes and failures. You can supply an
`EvalJudge` with your own `grade` implementation instead.

Each run records the suite snapshot and revision hash, judge ID/version, unique
session IDs per repetition, observations, references, criterion verdicts,
counts, timing, and errors by phase. `passed`, `failed`, `error`, and `cancelled`
remain distinct. Interaction mismatches and execution errors stop the case. App judging also
stops after a semantic failure; Studio judging grades after the conversation
has executed. This is not
a complete reproducibility record of model versions, prompts, app code, and
external data; retain those deployment details in your app's run record.

Raw exception messages are excluded from public results because they can
contain credentials. Log detailed failures privately in your app's hooks or
existing runtime diagnostics. Progress events are snapshots; listener failures
mark the run as a reporting error without skipping case cleanup.

## Lifecycle limits in this slice

- Sequential interrupts, including child workflows and custom contracts, use
  native resume execution. Remaining observed interrupts are cancelled during
  cleanup, including when the case intentionally ends on an interrupt.
- Simultaneous pending interrupts are reported as an execution error by the
  default executor, which attempts to cancel every observed request. Provide a
  custom executor for a domain-specific parallel interaction protocol.
- Early `completeResponse`/background continuation requires a custom executor.
  The default runner awaits attached execution completion and rejects a
  response stream that does not expose a completed workflow or human pause.
- Case and cleanup deadlines use cooperative abort signals. Arbitrary app
  callbacks must honor their signals; the runner cannot forcibly terminate
  JavaScript. It waits for work to settle before teardown to avoid racing
  cleanup against an execution that is still using its fixtures.
- Sessions are isolated, but databases and external side effects are only as
  isolated as the app's setup/teardown. Native cancellation does not delete
  persisted session records. Internal effects need explicit app checks; SDK
  deterministic behavior belongs in normal integration tests.

`evals.listSuites()` returns editable copies. `evals.describe()` returns schema
version 1, suites, named handlers, optional parameter JSON Schema, and judge
identity. Neither invokes setup. `createEvalRouteHandler` exposes this manifest
and runs to the Studio control plane. See [Studio execution](../05-studio/11-evals.md)
for authenticated transport, persistent runs, and local Docker setup. Saved-run comparisons are available in Studio. Prompt version pinning remains subsequent work.

## Optional typed case parameters

Most suites need no case parameters or schema: write prompts and expectations
directly. When app setup needs configurable actor or fixture identifiers, the SDK
also supports public JSON case parameters.

`defineSuite` supplies the suite structure, so you do not need a separate
`EvalSuite` annotation. Use `defineSuite<TParams>` to check case parameters while
authoring. Keep the Zod schema in `createEvals` for runtime validation.

```ts
import { createEvals, defineSuite } from "kortyx";
import { z } from "zod";

const paramsSchema = z.object({
  jobIds: z.array(z.string()).min(1).max(3),
}).strict();

type JobParams = z.input<typeof paramsSchema>;

export const authorizedJobsSuite = defineSuite<JobParams>({
  id: "authorized-jobs",
  cases: [{
    id: "job-description",
    params: { jobIds: ["barcelona-job"] },
    steps: [{
      message: "Describe the Barcelona AI Software Engineer role",
      expect: { type: "answer" },
    }],
  }],
});

const evals = createEvals({
  agent,
  paramsSchema,
  suites: [authorizedJobsSuite],
  setup: async ({ params }) => {
    // params.jobIds is string[] here and in the suite definition above.
    return prepareJobFixture(params.jobIds);
  },
});
```

Missing required parameters, misspelled fields, and incompatible values such as
`jobIds: [123]` are TypeScript errors. Constraints such as minimum array length
are checked at runtime. Derive `TParams` using `z.input<typeof paramsSchema>`
so defaults and transforms are applied once by the runner before `setup` receives
the schema's output type. The suite remains plain data. You can also use
`satisfies EvalSuite<JobParams>` without the helper. Without a type argument,
`defineSuite` checks the standard suite structure.

The parameters above belong to `suite.cases[].params`. They are neither workflow
output nor automatically discovered tool context. One `paramsSchema` validates
all cases registered on that `createEvals` instance. For several actor or fixture
shapes, use an app-owned discriminated union; the same endpoint can execute them
without creating a separate endpoint per user. Keep credentials in setup rather
than public parameters.

`defineSuite` also works in JavaScript without a generic type argument. JSON
suites can be validated with `parseEvalSuite(json)` before registration. Named
responders and references must already exist in the app; serialized definitions
cannot install executable callbacks. This release displays suite definitions in
Studio; authoring or saving new suites in Studio is not implemented.
