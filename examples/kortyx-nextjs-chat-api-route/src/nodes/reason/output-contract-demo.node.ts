import { google } from "@kortyx/google";
import { defineOutputContract, useReason } from "kortyx";
import { z } from "zod";
import { outputContractFixtureModel } from "@/lib/output-contract-fixture";

const card = defineOutputContract({
  description: "Publish a live card with a title, body, and highlights.",
  schemaId: "reason-demo.output-card",
  schemaVersion: "1",
  schema: z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    highlights: z.array(z.string().min(1)),
  }),
  stream: {
    fields: { title: "set", body: "text-delta", highlights: "append" },
  },
});

const completed = defineOutputContract({
  description: "Return the final rollout recommendation.",
  schemaId: "reason-demo.output-completed",
  schemaVersion: "1",
  schema: z.object({
    summary: z.string().min(1),
    recommendedAction: z.string().min(1),
  }),
  stream: {
    fields: { summary: "text-delta", recommendedAction: "text-delta" },
  },
});

export const outputContractDemoNode = async ({ input }: { input: unknown }) => {
  const result = await useReason({
    id: "output-contract-demo",
    model:
      process.env.KORTYX_OUTPUT_CONTRACT_FIXTURE === "1"
        ? outputContractFixtureModel
        : google("gemini-2.5-flash"),
    system:
      "Draft a concise rollout plan. Emit two distinct cards, with text between them, then return a final recommendation. Use the output contracts.",
    input: String(input ?? ""),
    stream: true,
    emit: true,
    outputs: { emit: { card }, return: { completed }, maxEmissions: 2 },
    toolExecution: { maxSteps: 8 },
  });

  return {
    data: { emissions: result.emissions, returned: result.returned },
    ui: { message: result.text },
  };
};
