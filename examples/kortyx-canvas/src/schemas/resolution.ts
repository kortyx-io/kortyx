import { z } from "zod";

/**
 * Inferred intent for one entity (brief or agent) when classifying chat
 * history before the canvas-creation / brief-query workflows run.
 *
 * - `use_known`: continuing with the previously-resolved id (e.g.
 *   "regenerate it"). Only meaningful when a known id was passed in.
 * - `search`: the user named or referred to a specific entity; the model
 *   produced a free-text query the DB should resolve.
 * - `pick_new`: the user explicitly wants a different one ("for a new
 *   brief", "different agent"). Forces the cache to clear before the picker
 *   runs.
 * - `unclear`: cannot tell — fall back to the picker.
 */
export const intentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("use_known") }),
  z.object({ kind: z.literal("search"), query: z.string().min(1) }),
  z.object({ kind: z.literal("pick_new") }),
  z.object({ kind: z.literal("unclear") }),
]);

/** Resolver output for the canvas-creation workflow (brief + agent). */
export const resolveJobAgentSchema = z.object({
  brief: intentSchema,
  agent: intentSchema,
});

/**
 * Resolver output for the brief-query workflow. Like {@link intentSchema}
 * but without the `pick_new` branch — the brief-query flow always falls
 * back to the generic picker on `unclear`, so `pick_new` would be
 * redundant.
 */
export const briefQueryIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("use_known") }),
  z.object({ kind: z.literal("search"), query: z.string().min(1) }),
  z.object({ kind: z.literal("unclear") }),
]);

export type Intent = z.infer<typeof intentSchema>;
export type BriefQueryIntent = z.infer<typeof briefQueryIntentSchema>;
