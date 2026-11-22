import { z } from "zod";

const label = z.string().trim().min(1).max(200);
const version = z.number().int().positive();
const fieldBase = {
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  label,
  description: z.string().trim().min(1).max(4000),
  abstain: z.boolean().default(false),
};
export const ScoreFieldSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...fieldBase,
      type: z.literal("text"),
      maxLength: z.number().int().min(1).max(4000).default(2000),
    })
    .strict(),
  z.object({ ...fieldBase, type: z.literal("boolean") }).strict(),
  z
    .object({
      ...fieldBase,
      type: z.literal("numeric"),
      min: z.number().finite(),
      max: z.number().finite(),
      direction: z.enum(["higher", "lower"]),
    })
    .strict(),
  z
    .object({
      ...fieldBase,
      type: z.literal("categorical"),
      categories: z.array(label).min(2).max(20),
    })
    .strict(),
]);
export const ScoreGroupDefinitionSchema = z
  .object({ name: label, fields: z.array(ScoreFieldSchema).min(1).max(20) })
  .strict()
  .superRefine((group, ctx) => {
    if (new Set(group.fields.map((f) => f.id)).size !== group.fields.length)
      ctx.addIssue({
        code: "custom",
        message: "Each field needs a unique ID.",
      });
    const assessment = group.fields.find((f) => f.id === "assessment");
    if (!assessment || assessment.type !== "text" || assessment.abstain)
      ctx.addIssue({
        code: "custom",
        message: "Include a required assessment text field.",
      });
    for (const field of group.fields) {
      if (field.type === "numeric" && field.min >= field.max)
        ctx.addIssue({
          code: "custom",
          message: "Numeric minimum must be less than maximum.",
        });
      if (
        field.type === "categorical" &&
        new Set(field.categories).size !== field.categories.length
      )
        ctx.addIssue({ code: "custom", message: "Categories must be unique." });
    }
  });
export const ScoreGroupSchema = ScoreGroupDefinitionSchema.safeExtend({
  id: z.string().min(1),
  version,
});
export const DEFAULT_ASSESSMENT_GROUP = ScoreGroupSchema.parse({
  id: "assessment",
  version: 1,
  name: "Assessment",
  fields: [
    {
      id: "assessment",
      label: "Assessment",
      type: "text",
      description:
        "Explain the conclusion and any limitations in the recorded evidence.",
      abstain: false,
      maxLength: 2000,
    },
  ],
});
export const EvaluatorDefinitionSchema = z
  .object({
    name: label,
    description: z.string().max(2000).default(""),
    prompt: z.object({ id: z.uuid(), version }).strict(),
    model: label,
    scoreGroup: z
      .object({ id: z.string().min(1).max(200), version })
      .strict()
      .default({ id: "assessment", version: 1 }),
    evidence: z.enum(["response", "trajectory"]).default("response"),
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
    })
    .strict(),
]);
export const EvaluatorRuleDefinitionSchema = z
  .object({
    name: label,
    evaluatorVersion: version,
    environment: label,
    stage: z.enum(["completed", "paused"]).default("completed"),
    workflowId: z.string().max(512).default(""),
    sampleRate: z.number().gt(0).max(1),
    dailyLimit: z.number().int().min(1).max(10000),
    enabled: z.boolean().default(false),
  })
  .strict();
export const EvaluatorRuleSchema = EvaluatorRuleDefinitionSchema.extend({
  id: z.uuid(),
  evaluatorId: z.uuid(),
  revision: version,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const ScoreFieldResultSchema = z
  .object({
    fieldId: z.string(),
    status: z.enum(["scored", "not_applicable", "insufficient_evidence"]),
    value: z.union([z.string(), z.number().finite(), z.boolean()]).optional(),
    evidence: z
      .array(
        z
          .object({
            eventId: z.string().min(1).max(512).optional(),
            recordingId: z.string().min(1).max(512).optional(),
            path: z.string().max(512).optional(),
          })
          .strict()
          .refine(
            (ref) => Boolean(ref.eventId) !== Boolean(ref.recordingId),
            "Reference one event or recording.",
          ),
      )
      .max(20)
      .default([]),
  })
  .strict();
export const EvaluatorExecutionSchema = z.object({
  id: z.uuid(),
  evaluatorId: z.uuid(),
  evaluatorVersion: z.number().int().nonnegative(),
  evaluatorName: z.string(),
  environment: z.string(),
  target: EvaluatorTargetSchema,
  source: z.enum(["preview", "manual", "rule", "experiment"]),
  status: z.enum(["queued", "running", "completed", "error", "cancelled"]),
  scoreGroup: ScoreGroupSchema,
  scores: z.array(ScoreFieldResultSchema).nullable(),
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
  scores: true,
  scoreGroup: true,
});
export type EvaluatorExecutionSummary = z.infer<
  typeof EvaluatorExecutionSummarySchema
>;
export const EvaluatorLibrarySchema = z.object({
  evaluators: z.array(EvaluatorSchema),
  scoreGroups: z.array(ScoreGroupSchema),
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
      createdAt: z.string(),
    }),
  ),
  rules: z.array(EvaluatorRuleSchema),
  executions: z.array(EvaluatorExecutionSummarySchema),
  datasets: z.array(
    z.object({
      targetId: z.string(),
      suiteId: z.string(),
      evaluatorVersion: version,
    }),
  ),
});
export type ScoreGroup = z.infer<typeof ScoreGroupSchema>;
export type EvaluatorDefinition = z.infer<typeof EvaluatorDefinitionSchema>;
export type EvaluatorReference = z.infer<typeof EvaluatorReferenceSchema>;
export type EvaluatorTarget = z.infer<typeof EvaluatorTargetSchema>;
export type EvaluatorRuleDefinition = z.infer<
  typeof EvaluatorRuleDefinitionSchema
>;
export type EvaluatorRule = z.infer<typeof EvaluatorRuleSchema>;
export type EvaluatorExecution = z.infer<typeof EvaluatorExecutionSchema>;
export type EvaluatorLibrary = z.infer<typeof EvaluatorLibrarySchema>;
export type EvaluatorDetail = z.infer<typeof EvaluatorDetailSchema>;

/** Validate the whole group before accepting any field, including abstentions. */
export function validateScoreGroupResult(group: ScoreGroup, value: unknown) {
  const results = z.array(ScoreFieldResultSchema).parse(value);
  if (
    results.length !== group.fields.length ||
    new Set(results.map((r) => r.fieldId)).size !== results.length
  )
    throw new Error("Return each score field exactly once.");
  for (const field of group.fields) {
    const result = results.find((r) => r.fieldId === field.id);
    if (!result) throw new Error(`Missing field ${field.id}.`);
    if (result.status !== "scored") {
      if (!field.abstain || result.value !== undefined)
        throw new Error(`Invalid abstention for ${field.id}.`);
      continue;
    }
    const schemas = {
      text: z
        .string()
        .trim()
        .min(1)
        .max(field.type === "text" ? field.maxLength : 4000),
      boolean: z.boolean(),
      numeric: z
        .number()
        .finite()
        .min(field.type === "numeric" ? field.min : -Infinity)
        .max(field.type === "numeric" ? field.max : Infinity),
      categorical: z
        .string()
        .refine(
          (v) => field.type === "categorical" && field.categories.includes(v),
        ),
    };
    schemas[field.type].parse(result.value);
  }
  return results;
}
