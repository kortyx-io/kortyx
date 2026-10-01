import {
  EvalManifestSchema,
  EvalProgressSchema,
  EvalRunResultSchema,
  EvalSuiteSchema,
} from "@kortyx/agent/evals";
import { z } from "zod";
export const EvalTargetsResponseSchema = z.object({
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
const summary = z.object({
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
});
export const EvalHistorySchema = z.object({ runs: z.array(summary) });
export const EvalDetailSchema = z.object({
  run: summary.extend({
    suite: EvalSuiteSchema,
    result: EvalRunResultSchema.nullable(),
    events: z.array(z.object({ id: z.number(), event: EvalProgressSchema })),
  }),
});
export type EvalTargets = z.infer<typeof EvalTargetsResponseSchema>;
export type EvalHistory = z.infer<typeof EvalHistorySchema>;
export type EvalDetail = z.infer<typeof EvalDetailSchema>["run"];
