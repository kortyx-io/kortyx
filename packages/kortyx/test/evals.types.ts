import type {
  Agent,
  EvalOutputExpectation,
  EvalSuite,
  ProviderModelRef,
} from "../src";
import { createEvalJudge, createEvals } from "../src";

const outputRequirements: EvalOutputExpectation[] = [
  { schemaId: "app.product-list" },
  { schemaId: "app.product-summary", schemaVersion: "1" },
];
const structuredSuite: EvalSuite = {
  id: "catalog",
  cases: [
    {
      id: "products",
      steps: [
        {
          message: "Show products",
          expect: { type: "answer", outputs: outputRequirements },
        },
      ],
    },
  ],
};
void structuredSuite;
const invalidOutput: EvalOutputExpectation = {
  schemaId: "app.product-list",
  // @ts-expect-error Output contract versions are strings.
  schemaVersion: 1,
};
void invalidOutput;

// Compile against the facade and the built agent declarations, as consumers do.
export function configureEvals(agent: Agent, model: ProviderModelRef) {
  const suite = {
    id: "roles",
    cases: [
      {
        id: "ambiguous-role",
        steps: [
          {
            message: "Show AI Software Engineer",
            expect: { type: "interrupt", schemaId: "app.role-picker" },
          },
          {
            resume: { using: "barcelona" },
            expect: {
              type: "answer",
              reference: { using: "role" },
              criteria: ["Describes the Barcelona role accurately."],
            },
          },
        ],
      },
    ],
  } satisfies EvalSuite;
  return createEvals({
    agent,
    suites: [suite],
    judge: createEvalJudge({ model }),
    setup: async () => ({
      token: "private",
      role: { id: "barcelona", description: "Build AI products." },
    }),
    execute: ({ prepared, run }) => {
      const token: string = prepared.token;
      // @ts-expect-error Setup inference must reject unknown prepared fields.
      prepared.missing;
      return run({
        context: { requestHeaders: { authorization: `Bearer ${token}` } },
      });
    },
    responders: {
      barcelona: {
        schemaId: "app.role-picker",
        respond: ({ prepared }) => ({
          type: "value",
          value: { roleId: prepared.role.id },
        }),
      },
    },
    references: { role: ({ prepared }) => prepared.role },
    teardown: ({ prepared }) => {
      const token: string = prepared.token;
      void token;
    },
  });
}

// Evidence configuration is available from the public facade with typed event names.
export function configureEvidence(agent: Agent, model: ProviderModelRef) {
  return createEvals({
    agent,
    judge: createEvalJudge({ model }),
    defaults: { evidence: { history: true, events: ["tool-call-result"] } },
    evidenceFilters: {
      events: {
        reads: (event) =>
          event.type === "tool-call-result" && event.tool === "read",
      },
    },
    suites: [
      {
        ...structuredSuite,
        evidence: {
          history: false,
          events: { using: "reads" },
          outputs: [{ schemaId: "app.product-list" }],
        },
      },
    ],
  });
}
const badEvidence: EvalSuite = {
  ...structuredSuite,
  // @ts-expect-error Streaming deltas are not selectable judge evidence.
  evidence: { events: ["text-delta"] },
};
void badEvidence;
