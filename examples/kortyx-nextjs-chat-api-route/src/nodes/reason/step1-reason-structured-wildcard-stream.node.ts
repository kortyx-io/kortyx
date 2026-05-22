import { google } from "@kortyx/google";
import { useReason } from "kortyx";
import { z } from "zod";

const AssessmentQuestionSchema = z.object({
  question_text: z.string().min(1),
  question_rationale: z.string().min(1),
});

const AssessmentPointSchema = z.object({
  criteria_label: z.string().min(1),
  criteria_explanation: z.string().min(1),
  criteria_rationale: z.string().min(1),
  importance: z.enum(["low", "medium", "high"]),
  questions: z.record(z.string(), AssessmentQuestionSchema),
});

const AssessmentGuideSchema = z.object({
  intro: z.object({
    question_text: z.string().min(1),
  }),
  assessment_points: z.record(z.string(), AssessmentPointSchema),
});

type AssessmentGuide = z.infer<typeof AssessmentGuideSchema>;

export const step1ReasonStructuredWildcardStreamNode = async ({
  input,
}: {
  input: unknown;
}) => {
  const userInput =
    String(input ?? "").trim() ||
    "Create an interview assessment guide for an account executive role.";

  const result = await useReason<AssessmentGuide>({
    id: "reason-structured-wildcard-stream",
    model: google("gemini-2.5-flash"),
    stream: true,
    emit: true,
    temperature: 0.2,
    maxOutputTokens: 1200,
    responseFormat: {
      type: "json",
    },
    system:
      "You are a hiring operations assistant. Return JSON only for an interview assessment guide.",
    input: [
      "Create an interview assessment guide as structured JSON.",
      "Use model-generated keys under assessment_points and under each questions object.",
      "Return intro.question_text and assessment_points with criteria labels, explanations, rationales, importance, and questions.",
      "Do not write markdown or explanation outside the JSON object.",
      "",
      `User input: ${userInput}`,
    ].join("\n"),
    outputSchema: AssessmentGuideSchema,
    structured: {
      schemaId: "reason-structured-wildcard-stream",
      schemaVersion: "1",
      stream: true,
      dataType: "reason-demo.assessment-guide",
      fields: {
        "intro.question_text": "text-delta",
        "assessment_points.*.criteria_label": "set",
        "assessment_points.*.questions.*.question_text": "text-delta",
      },
    },
  });

  const output: AssessmentGuide = result.output ?? {
    intro: {
      question_text: result.text,
    },
    assessment_points: {},
  };

  return {
    data: output,
    ui: {
      message: output.intro.question_text,
    },
  };
};
