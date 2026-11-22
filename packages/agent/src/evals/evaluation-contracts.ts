import { z } from "zod";
import {
  EvalJudgeResponseIdentitySchema,
  StudioEvalStartRequestSchema,
} from "./contracts";
import {
  EvalSettingsSchema,
  EvalTerminationSchema,
  ResolvedEvalSettingsSchema,
} from "./settings";
import {
  EvalCostsSchema,
  StudioEvalDetailSchema,
  StudioEvalRunSummarySchema,
} from "./studio-contracts";

export const EvaluationMetadataSchema = z
  .object({
    source: z
      .enum(["manual", "deployment", "schedule", "ci"])
      .default("manual"),
    commit: z.string().trim().min(1).max(100).optional(),
    deploymentUrl: z
      .url()
      .refine((value) => {
        try {
          const url = new URL(value);
          return (
            ["https:", "http:"].includes(url.protocol) &&
            !url.username &&
            !url.password
          );
        } catch {
          return false;
        }
      }, "Expected an HTTP(S) URL without credentials")
      .optional(),
  })
  .strict();
export const StudioEvaluationStartRequestSchema = z
  .object({
    targetId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(200).optional(),
    promptSelection: StudioEvalStartRequestSchema.shape.promptSelection,
    selection: z.enum(["all", "selected"]),
    suites: z
      .array(
        z
          .object({
            suiteId: z.string().min(1),
            suiteRevision: z.string().regex(/^[a-f0-9]{64}$/),
            caseIds: z.array(z.string().min(1)).min(1).max(100).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    ...EvalSettingsSchema.shape,

    metadata: EvaluationMetadataSchema.default({ source: "manual" }),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type StudioEvaluationStartRequest = z.input<
  typeof StudioEvaluationStartRequestSchema
>;
export const StudioEvaluationSummarySchema = z.object({
  termination: EvalTerminationSchema.nullable().optional(),
  resolvedSettings: ResolvedEvalSettingsSchema.optional(),
  interruptedSuites: z.number().int().nonnegative().optional(),
  failures: z
    .array(
      z.object({
        suiteRunId: z.uuid(),
        caseId: z.string().optional(),
        repetition: z.number().int().positive().optional(),
        phase: z.string(),
        code: z.string(),
        message: z.string(),
        diagnosticId: z.string().uuid().optional(),
      }),
    )
    .optional(),
  pendingAttempts: z
    .object({
      notStarted: z.number().int().nonnegative(),
      executing: z.number().int().nonnegative(),
      awaitingGrading: z.number().int().nonnegative(),
    })
    .optional(),
  id: z.uuid(),
  name: z.string(),
  targetId: z.string(),
  targetName: z.string(),
  environment: z.string(),
  selection: z.enum(["all", "selected"]),
  metadata: EvaluationMetadataSchema,
  judge: EvalJudgeResponseIdentitySchema.optional(),
  status: StudioEvalRunSummarySchema.shape.status,
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  cancelRequestedAt: z.string().nullable(),
  suiteCount: z.number().int().nonnegative(),
  completedSuites: z.number().int().nonnegative(),
  totalAttempts: z.number().int().nonnegative(),
  completedAttempts: z.number().int().nonnegative(),
  counts: z.object({
    passed: z.number(),
    failed: z.number(),
    error: z.number(),
    cancelled: z.number(),
  }),
  costs: EvalCostsSchema.optional(),
  legacy: z.boolean().optional(),
});
export const StudioEvaluationHistorySchema = z.object({
  runs: z.array(StudioEvaluationSummarySchema),
});
export const StudioEvaluationDetailSchema = z.object({
  run: StudioEvaluationSummarySchema.extend({
    suites: z.array(StudioEvalRunSummarySchema),
  }),
});
export const StudioEvaluationResultsSchema = z.object({
  run: StudioEvaluationSummarySchema.extend({
    suites: z.array(StudioEvalDetailSchema.shape.run),
  }),
});
export type StudioEvaluationSummary = z.infer<
  typeof StudioEvaluationSummarySchema
>;
export type StudioEvaluationDetail = z.infer<
  typeof StudioEvaluationDetailSchema
>["run"];
