import "server-only";

import { google } from "@kortyx/google";
import { useReason } from "kortyx";
import type { z } from "zod";
import type { ChatHistoryMessage } from "@/lib/runtime-context";
import { type Intent, resolveJobAgentSchema } from "@/schemas/resolution";
import {
  type EntityCandidate,
  searchAgentCandidates,
  searchBriefCandidates,
} from "../lib/search-entities";
import { serializeHistoryForPrompt } from "../lib/serialize-history";
import { loadPrompt } from "../prompts/_registry";

/**
 * A single search candidate surfaced from the DB. Passed through to the
 * client (via interrupt `meta`) so the picker can show a filtered
 * shortlist instead of a free-text search.
 *
 * @deprecated Use {@link EntityCandidate} from `lib/search-entities` — kept
 * here as a re-export for the existing client imports.
 */
export type ResolutionCandidate = EntityCandidate;

/** Public resolution result the node consumes. */
export type Resolution =
  | { kind: "use_known"; label: string | undefined }
  | { kind: "use_search"; id: string; label: string }
  | {
      kind: "search_candidates";
      query: string;
      candidates: EntityCandidate[];
    }
  | { kind: "pick_new" }
  | { kind: "unclear" };

export type ResolveFromHistoryArgs = {
  history: ChatHistoryMessage[];
  latestUserMessage: string;
  tenantId: string;
  knownBriefId: string | undefined;
  knownBriefLabel: string | undefined;
  knownAgentId: string | undefined;
  knownAgentLabel: string | undefined;
};

export type ResolveFromHistoryResult = {
  brief: Resolution;
  agent: Resolution;
};

/**
 * Classifies the user's chat history into a brief/agent resolution intent
 * in one LLM call, then materialises any `search` intents into concrete
 * ids by querying the tenant's brief/agent list. Designed to be safe to
 * call on every canvas-creation invocation — the model can return
 * `use_known` to keep the cached id, and unclear/pick_new paths fall
 * through to the picker.
 *
 * Replay safety: the resolver uses a stable `useReason` id internally so
 * Kortyx can cache the result across interrupt resumes.
 */
export async function resolveFromHistory(
  args: ResolveFromHistoryArgs,
): Promise<ResolveFromHistoryResult> {
  const { system, user } = loadPrompt("resolve-brief-agent", {
    knownBriefBlock: args.knownBriefId
      ? `Known brief: id=${args.knownBriefId}, label="${args.knownBriefLabel ?? "(unknown)"}"`
      : "Known brief: none",
    knownAgentBlock: args.knownAgentId
      ? `Known agent: id=${args.knownAgentId}, label="${args.knownAgentLabel ?? "(unknown)"}"`
      : "Known agent: none",
    historyBlock: serializeHistoryForPrompt(args.history, args.history.length),
    latestUserMessage: args.latestUserMessage || "(empty)",
  });

  const result = await useReason<z.infer<typeof resolveJobAgentSchema>>({
    id: "resolve-brief-agent-from-history",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    outputSchema: resolveJobAgentSchema,
    responseFormat: { type: "json" },
    emit: false,
  });

  const parsed = result.output ?? {
    brief: { kind: "unclear" as const },
    agent: { kind: "unclear" as const },
  };

  const [brief, agent] = await Promise.all([
    materialise({
      what: "brief",
      intent: parsed.brief,
      knownLabel: args.knownBriefLabel,
      tenantId: args.tenantId,
    }),
    materialise({
      what: "agent",
      intent: parsed.agent,
      knownLabel: args.knownAgentLabel,
      tenantId: args.tenantId,
    }),
  ]);

  console.log("[resolve-from-history]", { raw: parsed, brief, agent });

  return { brief, agent };
}

async function materialise(args: {
  what: "brief" | "agent";
  intent: Intent;
  knownLabel: string | undefined;
  tenantId: string;
}): Promise<Resolution> {
  if (args.intent.kind === "use_known") {
    return { kind: "use_known", label: args.knownLabel };
  }
  if (args.intent.kind === "pick_new") return { kind: "pick_new" };
  if (args.intent.kind === "unclear") return { kind: "unclear" };

  // `search` — fuzzy-match against the tenant's list. Auto-resolve only
  // when there's exactly one hit; when several titles match, hand the
  // shortlist to the picker so the user disambiguates explicitly (no
  // guessing). Empty → unclear so the picker falls back to its default
  // free-text search.
  const candidates =
    args.what === "brief"
      ? await searchBriefCandidates({
          tenantId: args.tenantId,
          query: args.intent.query,
        })
      : await searchAgentCandidates({
          tenantId: args.tenantId,
          query: args.intent.query,
        });

  if (candidates.length === 0) return { kind: "unclear" };
  if (candidates.length === 1) {
    const only = candidates[0];
    if (!only) return { kind: "unclear" };
    return { kind: "use_search", id: only.id, label: only.label };
  }
  return {
    kind: "search_candidates",
    query: args.intent.query,
    candidates,
  };
}
