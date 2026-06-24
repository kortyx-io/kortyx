import { z } from "zod";

export const SessionStatusSchema = z.enum([
  "running",
  "completed",
  "interrupted",
  "failed",
  "cancelled",
]);
export const SessionSortKeySchema = z.enum([
  "activity",
  "duration",
  "tokens",
  "cost",
  "runs",
  "status",
]);
const ProviderSchema = z.enum(["OpenAI", "Anthropic", "Google"]);
const EnvironmentSchema = z.enum(["Development", "Staging", "Production"]);

export const SessionSchema = z.object({
  id: z.string(),
  status: SessionStatusSchema,
  lastActivityAt: z.string(),
  workflow: z.string(),
  workflowCount: z.number(),
  version: z.string(),
  user: z.string().optional(),
  tenant: z.string().optional(),
  runs: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  interrupted: z.number(),
  checkpoints: z.number().optional(),
  hasFork: z.boolean().optional(),
  duration: z.number().optional(),
  tokens: z.number().optional(),
  cost: z.number().optional(),
  latestResult: z.string(),
  latestError: z.string().optional(),
  pendingInterrupt: z.string().optional(),
  providers: z.array(ProviderSchema),
  models: z.array(z.string()),
  tags: z.array(z.string()),
  environment: EnvironmentSchema,
});

export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type SessionSortKey = z.infer<typeof SessionSortKeySchema>;
export type Session = z.infer<typeof SessionSchema>;
