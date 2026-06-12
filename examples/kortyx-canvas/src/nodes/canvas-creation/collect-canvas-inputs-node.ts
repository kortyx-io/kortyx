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
import { getAgentById, getBriefById } from "../../services/demo-data";
import { emitResolvedEntity } from "../../streaming/resolved-entity";

type CanvasInputIds = {
  briefId?: string;
  agentId?: string;
  originalUserMessage?: string;
};

/**
 * First step of the canvas-creation workflow. Ensures we have a brief id.
 *
 * Keep this as a separate workflow node from agent collection. Each node may
 * interrupt, and separate nodes give fork/checkpoint a stable graph anchor
 * for the currently visible picker.
 *
 * Resolution order per entity:
 *   1. LLM resolver (`resolveFromHistory`) inspects chat history + the
 *      latest user message and classifies intent (`use_known` / `search`
 *      / `pick_new` / `unclear`). A `search` intent is materialised by
 *      querying the tenant's briefs / agents.
 *   2. If the resolver yields a concrete id (existing one via
 *      `use_known` or a new one via `search`), it is reused — no picker.
 *   3. Otherwise (`pick_new` / `unclear` / multiple-hit `search`), we fall
 *      back to the picker (shortlist when we have candidates, generic
 *      free-text picker otherwise).
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
export const collectDiscoveryCanvasBriefNode = async ({
  input,
}: {
  input: unknown;
}) => {
  const ctx = useRuntimeContext<CanvasAgentContext>();
  const inputIds = readInputIds(input);
  const [storedJobId, setStoredJobId] = useWorkflowState<string | undefined>(
    "collectedJobId",
    inputIds.briefId ?? ctx.briefId,
  );

  if (!ctx.tenantId) {
    throw new Error(
      "collectDiscoveryCanvasBriefNode: missing tenantId in runtime context",
    );
  }

  const latestUserMessage = readLatestUserMessage(input);
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
    knownAgentId: inputIds.agentId ?? ctx.agentId,
    knownAgentLabel: ctx.agentLabel,
  });

  console.log("[collect-canvas-brief] resolver", {
    storedJobId,
    brief: resolution.brief,
  });

  const jobOutcome = applyResolution({
    resolution: resolution.brief,
    storedId: storedJobId,
    knownLabel: ctx.briefLabel,
    setStoredId: setStoredJobId,
  });
  const agentOutcome = pickResolvedId({
    resolution: resolution.agent,
    storedId: inputIds.agentId ?? ctx.agentId,
    knownLabel: ctx.agentLabel,
  });

  let briefId = jobOutcome.id;
  let briefLabel = jobOutcome.label;

  if (!briefId) {
    const picked = await runPicker({
      what: "brief",
      resolution: resolution.brief,
      contextHint:
        "The user is setting up a Product Discovery Canvas and needs to pick the discovery brief the canvas is being built for.",
    });
    briefId = picked.id;
    briefLabel = picked.label;
    setStoredJobId(briefId);
  }
  emitResolvedEntity({
    kind: "brief",
    id: briefId,
    label:
      briefLabel ??
      (await lookupEntityLabel({
        what: "brief",
        tenantId: ctx.tenantId,
        id: briefId,
      })) ??
      briefId,
  });

  return {
    data: {
      ...inputIds,
      briefId,
      originalUserMessage: latestUserMessage || inputIds.originalUserMessage,
      ...(agentOutcome.id ? { agentId: agentOutcome.id } : {}),
    },
  };
};

/**
 * Second canvas input node. Ensures we have the facilitator agent after the
 * brief node has completed. Keeping this separate from the brief picker
 * avoids forking a checkpoint that visually points at one interrupt while
 * the underlying graph resumes another interrupt inside the same node.
 */
export const collectDiscoveryCanvasAgentNode = async ({
  input,
}: {
  input: unknown;
}) => {
  const ctx = useRuntimeContext<CanvasAgentContext>();
  const inputIds = readInputIds(input);
  const [storedJobId, setStoredJobId] = useWorkflowState<string | undefined>(
    "collectedJobId",
    inputIds.briefId ?? ctx.briefId,
  );
  const [storedAgentId, setStoredAgentId] = useWorkflowState<
    string | undefined
  >("collectedAgentId", inputIds.agentId ?? ctx.agentId);

  if (!ctx.tenantId) {
    throw new Error(
      "collectDiscoveryCanvasAgentNode: missing tenantId in runtime context",
    );
  }

  const briefId = inputIds.briefId ?? storedJobId ?? ctx.briefId;
  if (!briefId) {
    throw new Error(
      "collectDiscoveryCanvasAgentNode: missing briefId — run collectDiscoveryCanvasBriefNode first",
    );
  }
  if (storedJobId !== briefId) setStoredJobId(briefId);

  const latestUserMessage =
    readLatestUserMessage(input) || inputIds.originalUserMessage || "";
  const history = ctx.history ?? [];

  if (inputIds.agentId) {
    setStoredAgentId(inputIds.agentId);
    emitResolvedEntity({
      kind: "agent",
      id: inputIds.agentId,
      label:
        (await lookupEntityLabel({
          what: "agent",
          tenantId: ctx.tenantId,
          id: inputIds.agentId,
        })) ?? inputIds.agentId,
    });
    return {
      data: { briefId, agentId: inputIds.agentId },
    };
  }

  const resolution = await resolveFromHistory({
    history,
    latestUserMessage,
    tenantId: ctx.tenantId,
    knownBriefId: briefId,
    knownBriefLabel: ctx.briefLabel,
    knownAgentId: storedAgentId,
    knownAgentLabel: ctx.agentLabel,
  });

  console.log("[collect-canvas-agent] resolver", {
    briefId,
    storedAgentId,
    agent: resolution.agent,
  });

  const agentOutcome = applyResolution({
    resolution: resolution.agent,
    storedId: storedAgentId,
    knownLabel: ctx.agentLabel,
    setStoredId: setStoredAgentId,
  });

  let agentId = agentOutcome.id;
  let agentLabel = agentOutcome.label;

  if (!agentId) {
    const picked = await runPicker({
      what: "agent",
      resolution: resolution.agent,
      contextHint:
        "The user is setting up a Product Discovery Canvas and needs to pick the facilitator agent. They have already selected a brief.",
    });
    agentId = picked.id;
    agentLabel = picked.label;
    setStoredAgentId(agentId);
  }
  emitResolvedEntity({
    kind: "agent",
    id: agentId,
    label:
      agentLabel ??
      (await lookupEntityLabel({
        what: "agent",
        tenantId: ctx.tenantId,
        id: agentId,
      })) ??
      agentId,
  });

  // Note: not emitting any chat preamble here on purpose. `announceDiscoveryCanvas
  // Creation` (next node down the workflow) covers the "Using brief X with
  // agent Y" message and streams it so the user sees activity before
  // the long-running `createDiscoveryCanvas` node takes over.
  return {
    data: { briefId, agentId },
  };
};

function readInputIds(input: unknown): CanvasInputIds {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const record = input as Record<string, unknown>;
  return {
    ...(typeof record.briefId === "string" ? { briefId: record.briefId } : {}),
    ...(typeof record.agentId === "string" ? { agentId: record.agentId } : {}),
    ...(typeof record.originalUserMessage === "string"
      ? { originalUserMessage: record.originalUserMessage }
      : {}),
  };
}

function readLatestUserMessage(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

type ApplyResolutionResult = {
  /** Resolved id, or undefined if we need to fall back to the picker. */
  id: string | undefined;
  /** Display label, surfaced to the next nodes via workflow state. */
  label: string | undefined;
};

function pickResolvedId(args: {
  resolution: Resolution;
  storedId: string | undefined;
  knownLabel: string | undefined;
}): ApplyResolutionResult {
  if (args.resolution.kind === "use_known") {
    return args.storedId
      ? { id: args.storedId, label: args.resolution.label ?? args.knownLabel }
      : { id: undefined, label: undefined };
  }
  if (args.resolution.kind === "use_search") {
    return { id: args.resolution.id, label: args.resolution.label };
  }
  return { id: undefined, label: undefined };
}

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

async function lookupEntityLabel(args: {
  what: EntityKind;
  tenantId: string;
  id: string;
}): Promise<string | undefined> {
  if (args.what === "brief") {
    const result = await getBriefById(args.tenantId, args.id);
    return result.data?.translations[0]?.title;
  }

  const result = await getAgentById(args.tenantId, args.id);
  return result.data?.title;
}
