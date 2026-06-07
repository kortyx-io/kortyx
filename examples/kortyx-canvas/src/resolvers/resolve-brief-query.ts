import "server-only";

import { google } from "@kortyx/google";
import { useReason } from "kortyx";
import type { ChatHistoryMessage } from "@/lib/runtime-context";
import {
  type BriefQueryIntent,
  briefQueryIntentSchema,
} from "@/schemas/resolution";
import { serializeHistoryForPrompt } from "../lib/serialize-history";
import { loadPrompt } from "../prompts/_registry";

/**
 * Classifies the user's chat into a single-brief lookup intent for the
 * brief-query workflow. Unlike the canvas-creation resolver this one does
 * NOT materialise the search — `find-brief-node` runs the DB query itself
 * because the workflow needs the search shortlist to drive picker UI.
 */
export async function resolveBriefQuery(args: {
  history: ChatHistoryMessage[];
  latestUserMessage: string;
  knownBriefId: string | undefined;
  knownBriefLabel: string | undefined;
}): Promise<BriefQueryIntent> {
  const { system, user } = loadPrompt("resolve-brief-query", {
    knownBriefBlock: args.knownBriefId
      ? `Known brief: id=${args.knownBriefId}, label="${args.knownBriefLabel ?? "(unknown)"}"`
      : "Known brief: none",
    historyBlock: serializeHistoryForPrompt(args.history, args.history.length),
    latestUserMessage: args.latestUserMessage || "(empty)",
  });

  const result = await useReason<BriefQueryIntent>({
    id: "find-brief-extract-query",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    outputSchema: briefQueryIntentSchema,
    responseFormat: { type: "json" },
    emit: false,
  });

  return result.output ?? { kind: "unclear" };
}
