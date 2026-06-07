import "server-only";

import { useRuntimeContext, useWorkflowState } from "kortyx";
import type { CanvasAgentContext } from "@/lib/runtime-context";
import {
  askCandidatePicker,
  askGenericPicker,
  type EntityKind,
} from "../../interrupts/pick-entity";
import {
  type Resolution,
  resolveFromHistory,
} from "../../resolvers/resolve-brief-agent";

/**
 * First step of the canvas-creation workflow. Ensures we have a brief id
 * and `agentId` before kicking off the LLM work.
 *
 * Resolution order per entity:
 *   1. LLM resolver (`resolveFromHistory`) inspects chat history + the
 *      latest user message and classifies intent (`use_known` / `search`
 *      / `pick_new` / `unclear`). A `search` intent is materialised by
 *      querying the tenant's briefs / agents.
 *   2. If the resolver yields a concrete id (existing one via
 *      `use_known` or a new one via `search`), it is reused — no picker.
 *   3. Otherwise (`pick_new` / `unclear` / multiple-hit `search`), the
 *      cached id is cleared and we fall back to the picker (shortlist
 *      when we have candidates, generic free-text picker otherwise).
 *
 * Stays silent in chat. Downstream `announceDiscoveryCanvasCreation` is the single
 * source of pre-generation messaging — adding a preamble here just
 * double-prints the same agent + brief names.
 *
 * Replay safety: every `useReason` call carries a stable id (including
 * the resolver's internal one), and resolved ids are mirrored on
 * workflow state so resumes after a picker response skip the already-
 * resolved entities.
 */
export const collectDiscoveryCanvasInputsNode = async ({
  input,
}: {
  input: unknown;
}) => {
  const ctx = useRuntimeContext<CanvasAgentContext>();
  const [storedJobId, setStoredJobId] = useWorkflowState<string | undefined>(
    "collectedJobId",
    ctx.briefId,
  );
  const [storedAgentId, setStoredAgentId] = useWorkflowState<
    string | undefined
  >("collectedAgentId", ctx.agentId);

  if (!ctx.tenantId) {
    throw new Error(
      "collectDiscoveryCanvasInputsNode: missing tenantId in runtime context",
    );
  }

  const latestUserMessage = String(input ?? "").trim();
  const history = ctx.history ?? [];

  // Runs on every workflow invocation; cached per-replay by the stable
  // `useReason` id inside `resolveFromHistory`. The result can override
  // cached storedJobId/storedAgentId when the user explicitly refers to a
  // different entity ("for the onboarding companion brief").
  const resolution = await resolveFromHistory({
    history,
    latestUserMessage,
    tenantId: ctx.tenantId,
    knownBriefId: storedJobId,
    knownBriefLabel: ctx.briefLabel,
    knownAgentId: storedAgentId,
    knownAgentLabel: ctx.agentLabel,
  });

  console.log("[collect-canvas-inputs] resolver", {
    storedJobId,
    storedAgentId,
    brief: resolution.brief,
    agent: resolution.agent,
  });

  const jobOutcome = applyResolution({
    resolution: resolution.brief,
    storedId: storedJobId,
    knownLabel: ctx.briefLabel,
    setStoredId: setStoredJobId,
  });

  let briefId = jobOutcome.id;

  if (!briefId) {
    const picked = await runPicker({
      what: "brief",
      resolution: resolution.brief,
      contextHint:
        "The user is setting up a Product Discovery Canvas and needs to pick the discovery brief the canvas is being built for.",
    });
    briefId = picked.id;
    setStoredJobId(briefId);
  }

  const agentOutcome = applyResolution({
    resolution: resolution.agent,
    storedId: storedAgentId,
    knownLabel: ctx.agentLabel,
    setStoredId: setStoredAgentId,
  });

  let agentId = agentOutcome.id;

  if (!agentId) {
    const picked = await runPicker({
      what: "agent",
      resolution: resolution.agent,
      contextHint:
        "The user is setting up a Product Discovery Canvas and needs to pick the facilitator agent. They have already selected a brief.",
    });
    agentId = picked.id;
    setStoredAgentId(agentId);
  }

  // Note: not emitting any chat preamble here on purpose. `announceDiscoveryCanvas
  // Creation` (next node down the workflow) covers the "Using brief X with
  // agent Y" message and streams it so the user sees activity before
  // the long-running `createDiscoveryCanvas` node takes over.
  return {
    data: { briefId, agentId },
  };
};

type ApplyResolutionResult = {
  /** Resolved id, or undefined if we need to fall back to the picker. */
  id: string | undefined;
  /** Display label, surfaced to the next nodes via workflow state. */
  label: string | undefined;
};

function applyResolution(args: {
  resolution: Resolution;
  storedId: string | undefined;
  knownLabel: string | undefined;
  setStoredId: (id: string | undefined) => void;
}): ApplyResolutionResult {
  const { resolution, storedId, knownLabel } = args;

  if (resolution.kind === "use_known") {
    if (storedId) {
      return { id: storedId, label: resolution.label ?? knownLabel };
    }
    return { id: undefined, label: undefined };
  }

  if (resolution.kind === "use_search") {
    args.setStoredId(resolution.id);
    return { id: resolution.id, label: resolution.label };
  }

  args.setStoredId(undefined);
  return { id: undefined, label: undefined };
}

/**
 * Drives the picker for a single entity. Switches between two shapes
 * based on the resolver's signal:
 *
 *  - `search_candidates`: skip the LLM item generator and go straight
 *    to a shortlist picker with the candidates in `meta`. The client
 *    renders them as clickable rows above the free-text search picker.
 *  - everything else (`pick_new`, `unclear`, `use_known`-without-cached):
 *    use the generic LLM-generated item.
 */
async function runPicker(args: {
  what: EntityKind;
  resolution: Resolution;
  contextHint?: string;
}): Promise<{ id: string; label: string | undefined }> {
  if (args.resolution.kind === "search_candidates") {
    return askCandidatePicker({
      what: args.what,
      query: args.resolution.query,
      candidates: args.resolution.candidates,
    });
  }

  const id = await askGenericPicker({
    what: args.what,
    ...(args.contextHint ? { contextHint: args.contextHint } : {}),
  });
  return { id, label: undefined };
}
