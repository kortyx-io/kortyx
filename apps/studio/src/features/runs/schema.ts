import { z } from "zod";

export const RunStatusSchema = z.enum([
  "running",
  "completed",
  "interrupted",
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
export const ProviderSchema = z.enum(["OpenAI", "Anthropic", "Google"]);
export const EnvironmentSchema = z.enum([
  "Development",
  "Staging",
  "Production",
]);

export const RunSchema = z.object({
  id: z.string(),
  status: RunStatusSchema,
  started: z.string(),
  startedAt: z.string(),
  workflow: z.string(),
  version: z.string(),
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
});

export type RunStatus = z.infer<typeof RunStatusSchema>;
export type SortKey = z.infer<typeof RunSortKeySchema>;
export type Provider = z.infer<typeof ProviderSchema>;
export type Environment = z.infer<typeof EnvironmentSchema>;
export type Run = z.infer<typeof RunSchema>;
