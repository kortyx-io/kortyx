import { google } from "@kortyx/google";
import { useReason } from "kortyx";
import { z } from "zod";

const StructuredDraftSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  bullets: z.array(z.string().min(1)).default([]),
});

type StructuredDraft = z.infer<typeof StructuredDraftSchema>;

export const step1ReasonStructuredStreamNode = async ({
  input,
}: {
  input: unknown;
}) => {
  const userInput =
    String(input ?? "").trim() || "Launch a small beta feature next week.";

  const result = await useReason<StructuredDraft>({
    id: "reason-structured-stream",
    model: google("gemini-2.5-flash"),
    stream: true,
    emit: true,
    temperature: 0.2,
    system: "You are a customer communications assistant. Return JSON only.",
    input: [
      "Write an actual customer-facing beta launch email as structured JSON.",
      "Do not write a memo, plan, outline, or explanation about the email.",
      "The body field must contain the real email copy that could be sent to customers.",
      "Respect the user's requested length and tone.",
      "If the user asks for a long email, make the body detailed and substantial.",
      "Keep the subject concise and sendable.",
      "Make bullets customer-facing highlights or next steps.",
      "",
      `User input: ${userInput}`,
    ].join("\n"),
    outputSchema: StructuredDraftSchema,
    structured: {
      schemaId: "reason-structured-stream",
      schemaVersion: "1",
      stream: true,
      dataType: "reason-demo.compose",
      fields: {
        subject: "set",
        body: "text-delta",
        bullets: "append",
      },
    },
  });

  const output: StructuredDraft = result.output ?? {
    subject: "Draft",
    body: result.text,
    bullets: [],
  };

  return {
    data: output,
    ui: {
      message: [`Subject: ${output.subject}`, "", output.body].join("\n"),
    },
  };
};
