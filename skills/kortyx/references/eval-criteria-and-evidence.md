# Write judge criteria and select evidence

Use this reference when authoring semantic eval criteria, explaining user-facing
structured output, or reducing judge input. Check the installed SDK before using
`defaults.evidence`, `suite.evidence`, or `evidenceFilters`; upgrade SDK, Studio
backend, and CLI together when adopting these fields.

## Establish what the frontend presents

Inspect the actual output contract and renderer. Record which fields become chat
messages, prose, cards, progress, or hidden application data. Include conditions
that change visibility or meaning. Do not assume `observation.text` is the final
answer, every structured field is visible, or tool results are displayed.

Kortyx supplies execution evidence; it does not run the frontend. A judge can
assess emitted content against an explicitly described presentation contract.
Browser tests verify that the renderer follows that contract. Keep presentation
rules application-owned and update them when the renderer changes; do not add
frontend-specific heuristics to the generic judge.

## Put the assessment contract in every relevant criterion

`createEvalJudge` has no custom `prompt` option. With the built-in judge, put
application instructions in `expect.criteria` strings (or `{ id, text }` entries).
Each criterion is sent in a separate request. Do not place presentation rules in
one criterion and expect the others to see them. Share a short string helper in
suite source; the resulting suite remains plain data.

For example, this hypothetical app displays two fields of one output and keeps
its plan private. Confirm the equivalent rules in the actual app before adopting:

```ts
import { defineSuite } from "kortyx";

const presentation = [
  "Assess the completed app.answer output in observation.structured.",
  "data.message is rendered as chat; data.prose is rendered as detail prose.",
  "Both are user-facing. data.plan and data.recordId are internal and hidden.",
  "observation.text is progress-only in this app. Tool results are supporting facts.",
].join(" ");
const visibleAnswer = (rule: string) => `${presentation} ${rule}`;

export const answerSuite = defineSuite({
  id: "visible-answer",
  evidence: { history: false, outputs: [{ dataType: "app.answer" }] },
  cases: [{
    id: "backpack-price",
    steps: [{
      message: "Describe the blue Travel Backpack and its price.",
      expect: {
        type: "answer",
        outputs: [{ schemaId: "app.answer", schemaVersion: "1" }],
        criteria: [
          visibleAnswer("data.message must identify the requested blue Travel Backpack; naming it only in a hidden field or tool result is insufficient."),
          visibleAnswer("data.prose must state the price and currency from the successful product lookup. If that lookup reports no price, state it is unavailable. If the supporting result is missing, fail for insufficient evidence."),
        ],
      },
    }],
  }],
});
```

`expect.outputs` checks required completed schema contracts before LLM grading.
`evidence.outputs` selects envelopes for the judge. Neither proves browser
visibility. Use `expect.reference` for independent expected facts; it is not a
replacement for instructions in the criterion. Setup state and case names are
not automatically supplied as judge instructions.

Specify the assessed fields, pass condition, supporting source, and missing-data
behavior. A successful tool result establishes what the workflow received, not
independent correctness of the external service. An internal plan or successful
call cannot satisfy a requirement to communicate the answer. Accept equivalent
wording and valid execution paths unless execution itself is being tested.
At an interrupt, grade the question/request/options as a pause, not a completed
post-resume answer. Calibrate with good and bad observations, including facts that
appear only in hidden fields, wrong-entity results, and missing supporting data.
Keep criteria focused: every criterion repeats evidence in another judge call.

## Choose evidence at application and suite level

The default is compact evidence plus earlier steps in the same case. Compaction
removes intermediate structured patches, text deltas, routine status/transitions,
and duplicate finals. It retains useful ordered tool activity, errors, interrupts,
limits and invalidations. Tool payloads are not truncated. Final text and structured
envelopes remain; `streaming` envelopes are not completed outputs. Full captures
stay in saved results and Studio.

```ts
const evals = createEvals({
  agent,
  judge,
  defaults: { evidence: { history: true } },
  suites: [
    answerSuite,
    {
      id: "text-style",
      evidence: { history: false, events: false, outputs: false },
      cases: [{
        id: "brief",
        steps: [{
          message: "Say hello in one sentence.",
          expect: { type: "answer", criteria: ["observation.text is one welcoming sentence."] },
        }],
      }],
    },
  ],
});
```

- `history: false` removes earlier case steps from judge requests. It does not
  change agent memory/execution or saved observations. One-step cases have no
  earlier steps. Retain history for follow-ups and resumes needing earlier facts.
- `events: false` or `[]` removes events, while keeping text, structured outputs,
  and interrupt details. A typed list selects event types, for example
  `["tool-call-start", "tool-call-result", "tool-call-error"]`.
- `outputs: false` or `[]` removes structured envelopes and their structured-event
  copies. A selector such as `{ dataType: "app.answer", schemaVersion: "1" }`
  matches all its supplied fields; any matching selector includes the envelope.
  At least `dataType` or `schemaId` is required. Selectors do not project nested
  fields, redact tool results, or change what the frontend renders.
- Suite fields override application defaults individually; arrays replace rather
  than concatenate. Omitted fields inherit. Re-enable history with `true`; for
  events/outputs supply the desired selection. There is no `events: true`,
  `outputs: true`, or compact/full switch.

With all three disabled, the judge still receives current text, input, reference
facts and interrupt information. There is no text/interrupt disable option. Do
not remove tool results while asking the judge to check grounding in those results.
Filtered evidence is not a privacy boundary and missing events cannot prove an
action did not happen. Enable `toolExecution.emit: true` in relevant `useReason`
calls before expecting tool facts; evidence selection cannot enable emission.

## Custom predicates and replay

Register pure synchronous boolean predicates in `createEvals.evidenceFilters`.
Use `{ using, params? }` in defaults or a suite so discovery stays serializable:

```ts
createEvals({
  agent,
  judge,
  suites: [answerSuite],
  defaults: {
    evidence: { events: { using: "product-tools-v1", params: { tool: "read_product" } } },
  },
  evidenceFilters: {
    events: {
      "product-tools-v1": (event, params) => {
        if (params === null || typeof params !== "object" || Array.isArray(params)) return false;
        return "tool" in params && event.tool === params.tool;
      },
    },
    outputs: {
      "answer-v1": (output) => output !== null && typeof output === "object" &&
        !Array.isArray(output) && "dataType" in output && output.dataType === "app.answer",
    },
  },
});
```

A suite may select `outputs: { using: "answer-v1" }`. The event predicate above
keeps only matching tool events; it deliberately excludes unrelated error/limit
and invalidation events too. Choose it only when the criterion does not need those.
Predicates run after compaction on isolated copies, and cannot restore streaming
noise. Unknown names are configuration errors; thrown/non-boolean/asynchronous
results become grading errors. Version filter names when behavior changes.

Selection applies to current and previous observations. The SDK records selected
`step.evidence` for Studio replay without running application callbacks; raw
`step.observation` is preserved. Deterministic output and interrupt checks still
use the complete observation. The built-in rubric is `kortyx-rubric-v4`.
