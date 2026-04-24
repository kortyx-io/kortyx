import { useReason } from "kortyx";
import { z } from "zod";
import { google } from "@/lib/providers";

const MultiStreamDraftSchema = z.object({
  subject: z.string().min(1),
  preview: z.string().min(1),
  body: z.string().min(1),
  highlights: z.array(z.string().min(1)).default([]),
  ctas: z.array(z.string().min(1)).default([]),
});

type MultiStreamDraft = z.infer<typeof MultiStreamDraftSchema>;

export const step1ReasonStructuredMultiStreamNode = async ({
  input,
}: {
  input: unknown;
}) => {
  const userInput =
    String(input ?? "").trim() ||
    "Launch a new analytics workspace for operations teams.";

  const result = await useReason<MultiStreamDraft>({
    id: "reason-structured-multi-stream",
    model: google("gemini-2.5-flash"),
    stream: true,
    emit: true,
    temperature: 0.2,
    maxOutputTokens: 900,
    stopSequences: ["</campaign-brief>"],
    reasoning: {
      effort: "low",
      maxTokens: 256,
      includeThoughts: false,
    },
    responseFormat: {
      type: "json",
    },
    system:
      "You are a product marketing assistant. Return JSON only for a launch campaign brief.",
    input: [
      "Write a customer-facing launch draft as structured JSON.",
      "The preview field should be a short teaser line.",
      "The body field should be a longer detailed launch message.",
      "The highlights array should contain short feature highlights.",
      "The ctas array should contain short action-oriented next steps.",
      "Do not write a memo or planning notes.",
      "Do not include any wrapper tags such as </campaign-brief> in the response.",
      "",
      `User input: ${userInput}`,
    ].join("\n"),
    outputSchema: MultiStreamDraftSchema,
    structured: {
      schemaId: "reason-structured-multi-stream",
      schemaVersion: "1",
      stream: true,
      dataType: "reason-demo.multi-compose",
      fields: {
        subject: "set",
        preview: "text-delta",
        body: "text-delta",
        highlights: "append",
        ctas: "append",
      },
    },
  });

  console.log("Warnings:", result.warnings);
  console.log("Result:", result);

  const output: MultiStreamDraft = result.output ?? {
    subject: "Launch update",
    preview: "",
    body: result.text,
    highlights: [],
    ctas: [],
  };

  return {
    data: output,
    ui: {
      message: [
        `Subject: ${output.subject}`,
        "",
        output.preview,
        "",
        output.body,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  };
};
