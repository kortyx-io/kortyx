import { z } from "zod";
import {
  EvalManifestSchema,
  EvalProgressSchema,
  EvalRunResultSchema,
  EvalSuiteSchema,
} from "./contracts";
export const StudioEvalTargetsResponseSchema = z.object({
  canRun: z.boolean(),
  targets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      environment: z.string(),
      error: z.string().nullable(),
      manifest: EvalManifestSchema.nullable(),
      revisions: z.record(z.string(), z.string()),
    }),
  ),
});
export const StudioEvalRunSummarySchema = z.object({
  id: z.uuid(),
  targetId: z.string(),
  targetName: z.string(),
  environment: z.string(),
  suiteId: z.string(),
  suiteRevision: z.string(),
  status: z.enum([
    "queued",
    "running",
    "passed",
    "failed",
    "error",
    "cancelled",
  ]),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  error: z.string().nullable(),
  cancelRequestedAt: z.string().nullable(),
  counts: z
    .object({
      passed: z.number(),
      failed: z.number(),
      error: z.number(),
      cancelled: z.number(),
    })
    .nullable()
    .optional(),
  suiteName: z.string().nullable().optional(),
});
export const StudioEvalHistorySchema = z.object({
  runs: z.array(StudioEvalRunSummarySchema),
});
export const StudioEvalDetailSchema = z.object({
  run: StudioEvalRunSummarySchema.extend({
    request: z
      .object({
        caseIds: z.array(z.string()).optional(),
        repetitions: z.number().int().positive(),
        concurrency: z.number().optional(),
      })
      .optional(),
    suite: EvalSuiteSchema,
    result: EvalRunResultSchema.nullable(),
    events: z.array(z.object({ id: z.number(), event: EvalProgressSchema })),
  }),
});
export type StudioEvalTargets = z.infer<typeof StudioEvalTargetsResponseSchema>;
export type StudioEvalHistory = z.infer<typeof StudioEvalHistorySchema>;
export type StudioEvalDetail = z.infer<typeof StudioEvalDetailSchema>["run"];

export type StudioEvalRunSummary = z.infer<typeof StudioEvalRunSummarySchema>;
