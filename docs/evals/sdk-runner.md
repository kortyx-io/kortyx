# Conversation evals in the consumer application

`createEvals` runs scripted conversations against an existing `createAgent`
instance. A case sends messages, assesses the visible answer or interrupt,
resumes expected interrupts, and grades each criterion using a separate judge.
It executes real workflows, tools, and application logic.

The SDK exposes serializable suites, a manifest, progress events, and results.
Mount `createEvalRouteHandler` in the consumer app to let Studio execute suites
and persist their observations and grades. See [Studio execution](./studio-execution.md)
for the endpoint, database migration, and local Docker configuration.

## Smallest configuration

```ts
import { createEvals, createEvalJudge, type EvalSuite } from "kortyx";
import { agent } from "./agent";
import { judgeModel } from "./models"; // The app's configured ProviderModelRef.

const suite = {
  id: "job-information",
  cases: [{
    id: "all-three-salaries",
    steps: [
      { message: "List my engineering jobs", expect: { type: "answer" } },
      {
        message: "Give me the salary ranges for all three of those jobs",
        expect: {
          type: "answer",
          reference: [
            { city: "Barcelona", salary: "EUR 100,000–120,000" },
            { city: "Paris", salary: "EUR 90,000–110,000" },
            { city: "Madrid", salary: "EUR 80,000–100,000" },
          ],
          criteria: [
            "Gives all three salary ranges, attributed to the right jobs.",
            "Does not ask the user to choose just one job.",
          ],
        },
      },
    ],
  }],
} satisfies EvalSuite;

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

The reference facts must agree with the data deliberately available to the test
actor. Stable fixtures make behavior changes meaningful; changing live data can
change the expected answer. An unexpected picker fails before calling the
judge. Every configured criterion must pass. Without criteria, only the
interaction type and optional interrupt schema are checked.

## App-owned permissions, fixtures, and human responses

Suites are JSON data. Callback code stays registered in the consumer app.
`paramsSchema` validates a case's public `params` before setup. `setup` returns
private `prepared` state; its type flows into execute, responders, references,
and teardown without explicit generic arguments.

```ts
import { z } from "zod";
import { createEvals, createEvalJudge, type EvalSuite } from "kortyx";

const suite = {
  id: "role-ambiguity",
  cases: [{
    id: "choose-barcelona",
    params: { actor: "recruiter", fixture: "two-engineering-roles" },
    steps: [
      {
        message: "Bring me the AI Software Engineer role",
        expect: {
          type: "interrupt",
          schemaId: "app.role-picker",
          schemaVersion: "1",
          reference: { using: "candidates" },
          criteria: ["Offers the Barcelona and Paris roles as distinct choices."],
        },
      },
      {
        resume: { using: "chooseBarcelona" },
        expect: {
          type: "answer",
          reference: { using: "selectedRole" },
          criteria: ["Describes the selected Barcelona role accurately."],
        },
      },
    ],
  }],
} satisfies EvalSuite;

const evals = createEvals({
  agent,
  suites: [suite],
  judge: createEvalJudge({ model: judgeModel }),
  paramsSchema: z.object({
    actor: z.enum(["recruiter"]),
    fixture: z.enum(["two-engineering-roles"]),
  }).strict(),
  setup: async ({ params, sessionId, signal }) => {
    // These helpers belong to your application, including Auth0 login/token
    // acquisition, fixture isolation, and the actor's actual permissions.
    const accessToken = await obtainTestUserToken(params.actor, signal);
    const fixture = await prepareRoleFixture(params.fixture, sessionId, signal);
    return { accessToken, fixture };
  },
  execute: async ({ prepared, run }) => {
    // Reuse the context shape your normal app execution already consumes.
    // This example assumes its tools read context.requestHeaders.
    return run({
      context: {
        requestHeaders: { authorization: `Bearer ${prepared.accessToken}` },
      },
    });
  },
  responders: {
    chooseBarcelona: {
      schemaId: "app.role-picker",
      schemaVersion: "1",
      respond: ({ prepared }) => ({
        type: "value",
        value: { type: "select", roleId: prepared.fixture.barcelona.id },
      }),
    },
  },
  references: {
    candidates: ({ prepared }) => prepared.fixture.roles,
    selectedRole: ({ prepared }) => prepared.fixture.barcelona,
  },
  teardown: async ({ prepared, signal }) => {
    await removeRoleFixture(prepared.fixture, signal);
  },
});
```

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

The default executor assesses finalized visible text, streamed structured data,
and one pending interrupt per step. Structured entries retain their public
stream envelope, including `dataType`, `data`, and status. Raw workflow state,
silent tools, private setup state, and resume tokens are not copied into eval
results or judge input. Run/checkpoint IDs connect observations to diagnostics
when the agent supplies them. Custom executor observations are validated.

References are independent facts from fixtures or application reads. An inline
JSON reference works too. Objects containing only `using` and optional `params`
are reserved for named reference handlers. The runner snapshots the resolved
reference alongside each observation. Do not put secrets in case params,
messages, reference facts, custom observations, or responder values: these
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
remain distinct. A case stops after its first failed step or error. This is not
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
and runs to the Studio control plane. See [Studio execution](studio-execution.md)
for authenticated transport, persistent runs, and local Docker setup. Prompt
version pinning and automatic comparisons remain subsequent work.
