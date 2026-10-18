import { EvalSuiteSchema } from "@kortyx/agent/evals";

export const EVAL_FIXTURE = {
  baseline: "10000000-0000-4000-8000-000000000251",
  alternate: "10000000-0000-4000-8000-000000000253",
  candidate: "10000000-0000-4000-8000-000000000252",
  repeatedBaseline: "10000000-0000-4000-8000-000000000254",
  repeatedCandidate: "10000000-0000-4000-8000-000000000255",
  caseId: "ambiguity",
  suiteId: "e2e-ktx25-eval",
  targetId: "e2e-ktx25-eval",
  opaqueSuiteId: "suite:Paris/Barcelona?% café",
};
export const EVAL_OPAQUE_CASES = [
  { id: "role:Paris:Barcelona", name: "Colon role" },
  { id: "role/path?city=Paris#choice", name: "Delimiter role" },
  { id: "role%3A%25", name: "Percent role" },
  { id: "rôle café + Paris", name: "Unicode role" },
  { id: "role,city=Paris", name: "Comma role" },
];
export const EVAL_SUITE = EvalSuiteSchema.parse({
  id: EVAL_FIXTURE.suiteId,
  name: "E2E job conversations",
  cases: [
    {
      id: EVAL_FIXTURE.caseId,
      name: "Ambiguous role",
      steps: [
        {
          message: "Find the AI Software Engineer role",
          expect: {
            type: "answer",
            criteria: [
              {
                id: "description",
                text: "Returns the selected role description",
              },
            ],
            reference: { city: "Paris", role: { title: "Software Engineer" } },
          },
        },
      ],
    },
    {
      id: "repeated-role",
      name: "Repeated role",
      steps: [
        {
          message: "Describe the role",
          expect: { type: "answer", criteria: ["The description is present"] },
        },
      ],
    },
    {
      id: "human-choice",
      name: "Choose between cities",
      steps: [
        {
          message: "Find a role",
          expect: {
            type: "interrupt",
            schemaId: "job-picker",
            schemaVersion: "1",
          },
        },
        {
          resume: { type: "select", ids: ["paris"] },
          expect: {
            type: "answer",
            criteria: ["Describes the selected Paris role"],
          },
        },
      ],
    },
    ...EVAL_OPAQUE_CASES.map(({ id, name }) => ({
      id,
      name,
      steps: [
        {
          message: "Find this role",
          expect: {
            type: "answer" as const,
            criteria: ["Returns the selected role description"],
          },
        },
      ],
    })),
  ],
});
export const EVAL_OPAQUE_SUITE = EvalSuiteSchema.parse({
  ...EVAL_SUITE,
  id: EVAL_FIXTURE.opaqueSuiteId,
  name: "Opaque suite identifiers",
});
