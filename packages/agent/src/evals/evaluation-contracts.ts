import { z } from "zod";
import {
  EvalJudgeIdentitySchema,
  StudioEvalStartRequestSchema,
} from "./contracts";
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
    judge: z.enum(["studio", "app"]).default("studio"),
    repetitions: z.number().int().min(1).max(20).default(1),
    concurrency: z.number().int().min(1).max(4).default(1),
    metadata: EvaluationMetadataSchema.default({ source: "manual" }),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type StudioEvaluationStartRequest = z.input<
  typeof StudioEvaluationStartRequestSchema
>;
export const StudioEvaluationSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  targetId: z.string(),
  targetName: z.string(),
  environment: z.string(),
  selection: z.enum(["all", "selected"]),
  metadata: EvaluationMetadataSchema,
  judge: EvalJudgeIdentitySchema.optional(),
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
