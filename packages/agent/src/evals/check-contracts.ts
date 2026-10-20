import { z } from "zod";

const name = z.string().trim().min(1).max(256);
export const EvalCheckSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("text-equals"),
      value: z.string(),
      ignoreCase: z.boolean().optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("text-contains"), value: z.string().min(1) })
    .strict(),
  z
    .object({
      type: z.literal("text-matches"),
      pattern: z.string().min(1).max(1000),
      flags: z.string().max(10).optional(),
    })
    .strict()
    .refine(
      ({ pattern, flags }) => {
        try {
          new RegExp(pattern, flags);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid regular expression or flags." },
    ),
  z.object({ type: z.literal("tool-called"), tool: name }).strict(),
  z
    .object({
      type: z.literal("tool-input-equals"),
      tool: name,
      input: z.json(),
    })
    .strict(),
  z
    .object({
      type: z.literal("output-equals"),
      schemaId: name,
      schemaVersion: name.optional(),
      path: z
        .array(z.union([z.string(), z.number().int().nonnegative()]))
        .max(64),
      value: z.json(),
    })
    .strict(),
]);
