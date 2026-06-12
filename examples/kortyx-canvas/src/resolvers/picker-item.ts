import "server-only";

import { google } from "@kortyx/google";
import { useReason } from "kortyx";
import { z } from "zod";

const ItemSchema = z.object({ item: z.string().min(1) });

/**
 * Tiny LLM call that returns the picker prompt.
 *
 * Used by the candidate-shortlist branches of the canvas-creation and
 * brief-query workflows — both paths display an item above a list of
 * matches. We pay one extra cheap flash call only when ambiguity occurs
 * (most searches return a single hit and skip this entirely).
 */
export async function localizedAmbiguityItem(args: {
  /** Stable id for replay caching; pass a value scoped to the caller. */
  id: string;
  what: "brief" | "agent";
  query: string;
}): Promise<string> {
  const subject = args.what === "brief" ? "briefs" : "agents";

  const system = [
    `Write ONE short, natural sentence (max 20 words) telling an user we found multiple ${subject} matching their query, and inviting them to pick one or search for another.`,
    "Include the query in quotes inside the sentence.",
    "Plain text only — no markdown, no JSON wrapping aside from the schema.",
    "Return JSON only matching the requested schema.",
  ].join(" ");

  const result = await useReason<z.infer<typeof ItemSchema>>({
    id: args.id,
    model: google("gemini-2.5-flash"),
    system,
    input: `Query: ${args.query}`,
    outputSchema: ItemSchema,
    responseFormat: { type: "json" },
    emit: false,
  });

  return (
    result.output?.item?.trim() ||
    // Fallback to English so we never block the picker on a bad LLM response.
    `I found multiple ${subject} matching "${args.query}" — pick one, or search for another.`
  );
}
