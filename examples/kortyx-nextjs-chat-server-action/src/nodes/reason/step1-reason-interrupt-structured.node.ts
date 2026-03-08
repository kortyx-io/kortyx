import { useReason, useStructuredData } from "kortyx";
import { z } from "zod";
import { google } from "@/lib/providers";

const ReasonPlanSchema = z.object({
  summary: z.string().min(1),
  recommendation: z.string().min(1),
  checklist: z.array(z.string().min(1)).default([]),
  userChoice: z.string().min(1).default("pending"),
});

const ChoiceInterruptRequestSchema = z.object({
  kind: z.enum(["choice", "multi-choice"]),
  question: z.string().min(1),
  options: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
      }),
    )
    .min(2),
});

const ChoiceInterruptResponseSchema = z.union([
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
]);

type ReasonPlan = z.infer<typeof ReasonPlanSchema>;
type ChoiceInterruptRequest = z.infer<typeof ChoiceInterruptRequestSchema>;
type ChoiceInterruptResponse = z.infer<typeof ChoiceInterruptResponseSchema>;

export const step1ReasonInterruptStructuredNode = async ({
  input,
}: {
  input: unknown;
}) => {
  const userInput = String(input ?? "").trim() || "Help me organize my week.";
  const reasonId = "reason-interrupt-structured";

  const result = await useReason<
    ReasonPlan,
    ChoiceInterruptRequest,
    ChoiceInterruptResponse
  >({
    id: reasonId,
    model: google("gemini-2.5-flash"),
    stream: true,
    emit: true,
    temperature: 0.2,
    system: "You are a planning assistant.",
    input: [
      "Create an actionable response for the user input.",
      "For the first pass, set userChoice to 'pending'.",
      "Return JSON only.",
      "",
      `User input: ${userInput}`,
    ].join("\n"),
    outputSchema: ReasonPlanSchema,
    structured: {
      schemaId: "reason-plan",
      schemaVersion: "1",
      stream: "patch",
      dataType: "reason-demo.plan",
    },
    interrupt: {
      schemaId: "reason-choice",
      schemaVersion: "1",
      requestSchema: ChoiceInterruptRequestSchema,
      responseSchema: ChoiceInterruptResponseSchema,
    },
  });

  const finalPlan: ReasonPlan = result.output ?? {
    summary: result.text,
    recommendation: result.text,
    checklist: [],
    userChoice: "unknown",
  };

  useStructuredData({
    id: reasonId,
    opId: result.opId,
    dataType: "reason-demo.lifecycle",
    mode: "final",
    data: {
      step: "done",
      choice: result.interruptResponse ?? "none",
      checklistCount: finalPlan.checklist.length,
    },
  });

  return {
    data: {
      plan: finalPlan,
      opId: result.opId,
    },
    ui: {
      message: [
        `Summary: ${finalPlan.summary}`,
        `Recommendation: ${finalPlan.recommendation}`,
        `Choice: ${finalPlan.userChoice}`,
        finalPlan.checklist.length > 0
          ? `Checklist: ${finalPlan.checklist.join(", ")}`
          : "Checklist: none",
      ].join("\n"),
    },
  };
};
