import { openrouter } from "@kortyx/openrouter";
import {
  createEvalJudge,
  createEvals,
  defineJudgePrompt,
  defineSuite,
  evalChecks,
  promptText,
} from "kortyx";
import { agent } from "./agent";

const reportingPrompt = defineJudgePrompt({
  id: "catalog/reporting-judge",
  messages: ({ criterion, input, observation, reference, conversation }) => [
    {
      role: "system",
      content:
        "Evaluate the supplied requirement using successful tool results and reference facts. Accept equivalent wording.",
    },
    {
      role: "user",
      content: promptText`Criterion: ${criterion.text}\nInput: ${input}\nObservation: ${observation}\nReference: ${reference}\nConversation: ${conversation}`,
    },
  ],
});
// Optional App judge. Studio can grade the same suite with its server-owned model.
const judge = process.env.APP_JUDGE_MODEL
  ? createEvalJudge({
      model: openrouter(process.env.APP_JUDGE_MODEL),
      prompt: reportingPrompt,
      id: "catalog/app",
      version: "1",
    })
  : undefined;

export const catalogSmoke = defineSuite({
  id: "catalog-smoke",
  ...(judge ? { judge } : {}),
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
            checks: [evalChecks.toolCalled("list_products")],
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
});
