import { z } from "zod";

/** Public events retained after streaming noise has been removed. */
export const EVAL_EVIDENCE_EVENT_TYPES = [
  "tool-call-start",
  "tool-call-result",
  "tool-call-error",
  "tool-result",
  "structured-data",
  "structured-data-invalidated",
  "interrupt",
  "error",
  "cancelled",
  "limit-reached",
] as const;

const id = z.string().trim().min(1).max(256);
const filter = z.object({ using: id, params: z.json().optional() }).strict();
export const EvalEvidencePolicySchema = z
  .object({
    history: z.boolean().optional(),
    events: z
      .union([
        z.literal(false),
        z.array(z.enum(EVAL_EVIDENCE_EVENT_TYPES)),
        filter,
      ])
      .optional(),
    outputs: z
      .union([
        z.literal(false),
        z.array(
          z
            .object({
              dataType: id.optional(),
              schemaId: id.optional(),
              schemaVersion: id.optional(),
            })
            .strict()
            .refine((value) => Boolean(value.dataType || value.schemaId), {
              message: "Select an output by dataType or schemaId.",
            }),
        ),
        filter,
      ])
      .optional(),
  })
  .strict();
