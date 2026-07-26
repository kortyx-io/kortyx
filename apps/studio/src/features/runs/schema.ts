import { z } from "zod";

export const RunStatusSchema = z.enum([
  "running",
  "completed",
  "interrupted",
  "incomplete",
  "failed",
  "cancelled",
]);
export const RunSortKeySchema = z.enum([
  "started",
  "duration",
  "tokens",
  "cost",
  "status",
]);
export const ProviderSchema = z.string();
export const EnvironmentSchema = z.string();

export const RunSchema = z.object({
  id: z.string(),
  status: RunStatusSchema,
  started: z.string(),
  startedAt: z.string(),
  workflow: z.string(),
  workflowIds: z.array(z.string()).optional(),
  workflowRefs: z
    .array(
      z.object({
        workflowId: z.string(),
        workflowRevisionId: z.string().optional(),
        declaredVersion: z.string().optional(),
      }),
    )
    .optional(),
  version: z.string(),
  transitionIds: z.array(z.string()).optional(),
  path: z.array(z.string()),
  session: z.string(),
  model: z.string(),
  models: z.number().optional(),
  duration: z.number(),
  tokens: z.number().optional(),
  cost: z.number().optional(),
  result: z.string(),
  provider: ProviderSchema,
  environment: EnvironmentSchema,
  user: z.string(),
  tenant: z.string(),
  hasTool: z.boolean(),
  hasRetry: z.boolean().optional(),
  interruptNode: z.string().optional(),
  interruptId: z.string().optional(),
  interruptStatus: z
    .enum(["pending", "resolved", "expired", "failed", "cancelled"])
    .optional(),
  interruptExpiresAt: z.string().optional(),
});

export type RunStatus = z.infer<typeof RunStatusSchema>;
export type SortKey = z.infer<typeof RunSortKeySchema>;
export type Provider = z.infer<typeof ProviderSchema>;
export type Environment = z.infer<typeof EnvironmentSchema>;
export type Run = z.infer<typeof RunSchema>;
