import { openrouter } from "@kortyx/openrouter";
import { createEvalJudge, createEvals, defineSuite } from "kortyx";
import { agent } from "./agent";

export const catalogSmoke = defineSuite({
  id: "catalog-smoke",
  name: "Catalog lookup",
  cases: [
    {
      id: "blue-backpack-price",
      name: "Read a product price",
      workflowId: "catalog",
      steps: [
        {
          message: "What is the price of the blue backpack in my catalog?",
          expect: {
            type: "answer",
            criteria: [
              "Uses a successful list_products tool result and reports the blue backpack's EUR 49 price faithfully. Fails if no successful lookup evidence is available.",
            ],
          },
        },
      ],
    },
  ],
});
export const evals = createEvals({
  agent,
  suites: [catalogSmoke],
  // Optional code judge for direct local execution or explicit Studio App judging.
  ...(process.env.APP_JUDGE_MODEL
    ? {
        judge: createEvalJudge({
          model: openrouter(process.env.APP_JUDGE_MODEL),
          id: "catalog/app",
          version: "1",
        }),
      }
    : {}),
});
