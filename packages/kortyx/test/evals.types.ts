import type { Agent, EvalSuite, ProviderModelRef } from "../src";
import { createEvalJudge, createEvals } from "../src";

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
