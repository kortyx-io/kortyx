import "server-only";

import { useRuntimeContext, useWorkflowState } from "kortyx";
import type { CanvasAgentContext } from "@/lib/runtime-context";
import { getBriefById, getLocalizedBriefContent } from "@/services/demo-data";
import {
  askCandidatePicker,
  askGenericPicker,
} from "../../interrupts/pick-entity";
import { searchBriefCandidates } from "../../lib/search-entities";
import { resolveBriefQuery } from "../../resolvers/resolve-brief-query";
import { emitResolvedEntity } from "../../streaming/resolved-entity";

const DEMO_LANGUAGE = "en";

type FindBriefOutput = {
  briefId: string;
  briefTitle: string;
};

/**
 * First step of the brief-query workflow. Figures out which brief the user
 * is talking about and emits its id for the next node to fetch details.
 *
 * Resolution order:
 *   1. LLM (`resolveBriefQuery`) extracts a search query from history +
 *      the latest message (`use_known` | `search` { query } | `unclear`).
 *   2. `use_known` + cached `ctx.briefId` → reuse without DB call.
 *   3. `search` → `searchBriefCandidates`. 1 hit auto-resolves; >1 fires a
 *      shortlist picker; 0 hits → fall back to the generic picker.
 *   4. `unclear` → generic picker.
 *
 * Replay-safe via stable `useReason`/`useInterrupt` ids and workflow
 * state.
 */
export const findBriefNode = async ({
  input,
}: {
  input: unknown;
}): Promise<{ data: FindBriefOutput }> => {
  const ctx = useRuntimeContext<CanvasAgentContext>();
  const [storedJobId, setStoredJobId] = useWorkflowState<string | undefined>(
    "foundJobId",
    ctx.briefId,
  );

  if (!ctx.tenantId) {
    throw new Error("findBriefNode: missing tenantId in runtime context");
  }

  const latestUserMessage = String(input ?? "").trim();
  const history = ctx.history ?? [];

  const extraction = await resolveBriefQuery({
    history,
    latestUserMessage,
    knownBriefId: storedJobId,
    knownBriefLabel: ctx.briefLabel,
  });

  console.log("[find-brief] extraction", { storedJobId, extraction });

  let briefId: string | undefined;
  let briefTitle = ctx.briefLabel ?? "";

  if (extraction.kind === "use_known" && storedJobId) {
    briefId = storedJobId;
  } else if (extraction.kind === "search") {
    const candidates = await searchBriefCandidates({
      tenantId: ctx.tenantId,
      query: extraction.query,
    });

    if (candidates.length === 1) {
      const only = candidates[0];
      if (only) {
        briefId = only.id;
        briefTitle = only.label;
      }
    } else if (candidates.length > 1) {
      const picked = await askCandidatePicker({
        what: "brief",
        query: extraction.query,
        candidates,
      });
      briefId = picked.id;
      briefTitle = picked.label ?? "";
    }
    // candidates.length === 0 falls through to generic picker below
  }

  if (!briefId) {
    briefId = await askGenericPicker({
      what: "brief",
      contextHint:
        "The user is asking for information about a discovery brief, not creating a Product Discovery Canvas.",
    });
  }

  setStoredJobId(briefId);

  if (!briefTitle.trim()) {
    briefTitle = await lookupBriefLabel(ctx.tenantId, briefId);
  }

  // Notify the client which brief is in focus so it can stash the id
  // alongside the picker-driven flow. Without this, auto-resolved single
  // hits wouldn't update `resolvedIds` and the next chat turn would lose
  // the brief context.
  emitResolvedEntity({ kind: "brief", id: briefId, label: briefTitle });

  return {
    data: { briefId, briefTitle },
  };
};

async function lookupBriefLabel(
  tenantId: string,
  briefId: string,
): Promise<string> {
  const result = await getBriefById(tenantId, briefId);
  if (!result.data) return "";
  return getLocalizedBriefContent(result.data.translations, DEMO_LANGUAGE)
    .title;
}
