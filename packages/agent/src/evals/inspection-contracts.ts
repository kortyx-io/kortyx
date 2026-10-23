import { z } from "zod";

/** Additive read protocol. Existing full-result routes remain available. */
export const EvalInspectionQuerySchema = z.object({
  view: z
    .enum(["overview", "attempts", "turn", "evidence"])
    .default("overview"),
  suite: z.string().min(1).max(200).optional(),
  caseId: z.string().min(1).max(200).optional(),
  status: z.string().min(1).max(40).optional(),
  phase: z.string().min(1).max(40).optional(),
  repetition: z.coerce.number().int().min(1).max(20).optional(),
  cursor: z.coerce.number().int().min(0).max(10_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  turn: z.coerce.number().int().min(0).max(100).default(0),
  section: z
    .enum([
      "input",
      "expectation",
      "observation",
      "criteria",
      "verification",
      "tools",
      "output",
      "interrupt",
      "model",
      "diagnostic",
      "context",
    ])
    .default("observation"),
  contentCursor: z.coerce.number().int().min(0).max(100_000_000).default(0),
  contentLimit: z.coerce.number().int().min(1).max(32_768).default(8_000),
  event: z.uuid().optional(),
});
export type EvalInspectionQuery = z.infer<typeof EvalInspectionQuerySchema>;

export const EvalInspectionCapabilitiesSchema = z.object({
  inspectionVersion: z.literal(1),
  views: z.array(z.string()),
  maxPageSize: z.number(),
  maxContentLength: z.number(),
});
export const EvalInspectionResponseSchema = z.object({
  inspectionVersion: z.literal(1),
  id: z.uuid(),
  view: EvalInspectionQuerySchema.shape.view,
  data: z.json(),
  page: z.object({
    available: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    omitted: z.number().int().nonnegative(),
    nextCursor: z.number().int().nonnegative().nullable(),
  }),
  expand: z.array(
    z.object({ command: z.string(), args: z.record(z.string(), z.string()) }),
  ),
});
