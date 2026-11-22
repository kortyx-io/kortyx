import { z } from "zod";

const label = z.string().trim().min(1).max(200);
const version = z.number().int().positive();
export const JUDGE_VARIABLES = [
  {
    path: "criterion",
    label: "Criterion",
    description:
      "The expected behavior for the selected dataset step, when supplied.",
  },
  {
    path: "criterion.text",
    label: "Criterion text",
    description: "The selected case's expected behavior.",
  },
  {
    path: "input",
    label: "Input",
    description: "The user message or response to human input.",
  },
  {
    path: "observation",
    label: "Observation",
    description:
      "The captured answer, structured outputs, events and human pause.",
  },
  {
    path: "observation.type",
    label: "Observation type",
    description: "Answer, interrupt, error or cancellation.",
  },
  {
    path: "observation.text",
    label: "Response text",
    description: "Text captured from the evaluated application.",
  },
  {
    path: "observation.structured",
    label: "Structured output",
    description: "Captured public structured outputs.",
  },
  {
    path: "observation.events",
    label: "Execution events",
    description:
      "Selected public events, including tool inputs, results and errors.",
  },
  {
    path: "observation.interrupt",
    label: "Human pause",
    description: "The captured question and offered choices, when available.",
  },
  {
    path: "reference",
    label: "Reference facts",
    description: "Expected facts supplied by the dataset, when available.",
  },
  {
    path: "conversation",
    label: "Conversation",
    description:
      "Recorded inputs and observations preceding the selected step.",
  },
] as const;
export const DEFAULT_JUDGE_CONTENT = {
  instructions:
    "Evaluate the observed response against the supplied criterion when present. Use the recorded input, reference facts, conversation and public execution events as evidence. Accept equivalent wording and any valid internal execution path. Do not add requirements the criterion does not contain.\n\nCheck factual claims against successful tool results and reference facts. An assistant's own claims are not independent proof. Missing events do not prove an action never occurred. Explain missing evidence without inventing facts.\n\nAn interrupt is a pause for human input, not a completed answer. Judge the question and offered choices at that step. Structured output is emitted data, not proof of frontend visibility.",
  context:
    "Criterion: {{criterion}}\nInput: {{input}}\nCurrent observation: {{observation}}\nReference facts: {{reference}}\nPreceding conversation: {{conversation}}",
};
export const JudgeContentSchema = z
  .object({
    instructions: z.string().trim().min(1).max(40000),
    context: z.string().trim().min(1).max(16000),
  })
  .strict()
  .superRefine((content, ctx) => {
    for (const [field, text] of Object.entries(content)) {
      if (/\{\{\s*>|\[\[prompt:/.test(text))
        ctx.addIssue({
          code: "custom",
          path: [field],
          message:
            "Judges own their instructions and cannot include ordinary Prompts.",
        });
      for (const match of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
        if (
          !JUDGE_VARIABLES.some(
            (variable) => variable.path === match[1]?.trim(),
          )
        )
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `Unknown judge variable: ${match[1]?.trim()}.`,
          });
      }
    }
  });
export const EvaluatorDefinitionSchema = z
  .object({
    name: label,
    description: z.string().max(2000).default(""),
    content: JudgeContentSchema,
    model: label,
    evidence: z.enum(["response", "trajectory"]).default("trajectory"),
  })
  .strict();
export const EvaluatorSchema = z.object({
  id: z.uuid(),
  revision: version,
  publishedVersion: z.number().int().nonnegative(),
  archived: z.boolean(),
  draft: EvaluatorDefinitionSchema,
  updatedAt: z.string(),
});
export const EvaluatorReferenceSchema = z
  .object({ id: z.uuid(), version })
  .strict();
export const EvaluatorTargetSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("run"),
      runId: z.string().min(1).max(512),
      environment: z.string().min(1).max(200).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("case"),
      evalRunId: z.uuid(),
      caseId: z.string().min(1).max(512),
      repetition: version,
      stepIndex: z.number().int().nonnegative().optional(),
      criterionId: z.string().max(512).optional(),
    })
    .strict(),
]);
export const JudgeVerdictSchema = z
  .object({
    passed: z.boolean(),
    reason: z.string().min(1),
    evidence: z.array(z.string()),
  })
  .strict();
export const EvaluatorExecutionSchema = z.object({
  id: z.uuid(),
  evaluatorId: z.uuid(),
  evaluatorVersion: z.number().int().nonnegative(),
  evaluatorName: z.string(),
  environment: z.string(),
  target: EvaluatorTargetSchema,
  source: z.literal("preview"),
  status: z.enum(["queued", "running", "completed", "error", "cancelled"]),
  verdict: JudgeVerdictSchema.nullable(),
  evidence: z.unknown(),
  renderedMessages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    }),
  ),
  usage: z
    .object({
      inputTokens: z.number().nonnegative().nullable(),
      outputTokens: z.number().nonnegative().nullable(),
      costUsd: z.number().nonnegative().nullable(),
      costSource: z.enum(["provider", "rate-card", "unavailable"]).optional(),
      tokenUsage: z
        .record(z.string(), z.union([z.number().nonnegative(), z.boolean()]))
        .optional(),
    })
    .nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  endedAt: z.string().nullable(),
});
export const EvaluatorExecutionSummarySchema = EvaluatorExecutionSchema.omit({
  evidence: true,
  renderedMessages: true,
  verdict: true,
});
export const EvaluatorLibrarySchema = z.object({
  evaluators: z.array(EvaluatorSchema),
  models: z.array(z.string()),
  canEdit: z.boolean(),
  canRun: z.boolean(),
  workerAvailable: z.boolean(),
});
export const EvaluatorDetailSchema = z.object({
  evaluator: EvaluatorSchema,
  versions: z.array(
    z.object({
      version,
      definition: EvaluatorDefinitionSchema,
      hash: z.string(),
      createdAt: z.string(),
    }),
  ),
  executions: z.array(EvaluatorExecutionSummarySchema),
});
export type EvaluatorDefinition = z.infer<typeof EvaluatorDefinitionSchema>;
export type EvaluatorReference = z.infer<typeof EvaluatorReferenceSchema>;
export type EvaluatorTarget = z.infer<typeof EvaluatorTargetSchema>;
export type EvaluatorExecution = z.infer<typeof EvaluatorExecutionSchema>;
export type EvaluatorExecutionSummary = z.infer<
  typeof EvaluatorExecutionSummarySchema
>;
export type EvaluatorLibrary = z.infer<typeof EvaluatorLibrarySchema>;
export type EvaluatorDetail = z.infer<typeof EvaluatorDetailSchema>;
