import "server-only";

import { google } from "@kortyx/google";
import { useReason } from "kortyx";
import { CANVAS_DRAFT_DATA_TYPE } from "@/lib/protocol";
import { loadPrompt } from "../../prompts/_registry";
import type { CreateDiscoveryCanvasPromptVariables } from "../../prompts/create-canvas";
import {
  type DiscoveryCanvasResponse,
  discoveryCanvasResponseSchema,
} from "../../schemas/discovery-canvas";
import {
  emitDiscoveryCanvasThinkingFinish,
  emitDiscoveryCanvasThinkingStart,
} from "../../streaming/canvas-thinking";

type CreateDiscoveryCanvasNodeParams = {
  temperature?: number;
};

type CreateDiscoveryCanvasNodeInput = {
  promptVars?: CreateDiscoveryCanvasPromptVariables;
};

const THINKING_STREAM_ID = "create-canvas-thinking";

/**
 * Generates a full Product Discovery Canvas (intro item + sections with one
 * or more items each) in a single LLM call. The structured response
 * is validated against `discoveryCanvasResponseSchema` (records keyed by
 * LLM-chosen snake_case identifiers, not arrays).
 *
 * This node is **pure LLM work** — it expects `fetchDiscoveryCanvasInputsNode` to
 * have already resolved `promptVars` on workflow state.
 */
export const createDiscoveryCanvasNode = async ({
  input,
  params,
}: {
  input: CreateDiscoveryCanvasNodeInput;
  params: CreateDiscoveryCanvasNodeParams;
}) => {
  if (!input?.promptVars) {
    throw new Error(
      "createDiscoveryCanvasNode: missing promptVars on workflow state — run fetchDiscoveryCanvasInputsNode first",
    );
  }

  console.log("[create-canvas] start", {
    briefTitle: input.promptVars.briefTitle,
    agentTitle: input.promptVars.agentTitle,
  });

  const { system, user } = loadPrompt("create-canvas", input.promptVars);

  emitDiscoveryCanvasThinkingStart({
    streamId: THINKING_STREAM_ID,
    phase: "create",
  });

  const result = await useReason<DiscoveryCanvasResponse>({
    id: "create-canvas",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    temperature: params.temperature ?? 0.3,
    outputSchema: discoveryCanvasResponseSchema,
    responseFormat: { type: "json" },
    stream: true,
    emit: true,
    // Stream each section/item by its resolved path so later targeted
    // updates can address them directly (e.g.
    // `sections.commercial_resilience.items.lost_deal_recovery`).
    structured: {
      dataType: CANVAS_DRAFT_DATA_TYPE,
      schemaId: "discovery-canvas",
      // Bumped to 2 alongside the title / facilitator_style_id / canvas_mode
      // additions on the response schema. Older drafts persisted in browser
      // storage simply lack these fields — they're optional on `DiscoveryCanvasDraft`
      // (which is `Partial<DiscoveryCanvasResponse>`), so they render as
      // empty controls and the user can fill them in.
      schemaVersion: "2",
      fields: {
        title: "text-delta",
        facilitator_style_id: "set",
        canvas_mode: "set",
        "intro.label": "text-delta",
        "intro.summary": "text-delta",
        "intro.item_text": "text-delta",
        "sections.*.section_label": "text-delta",
        "sections.*.section_summary": "text-delta",
        "sections.*": "set",
        "sections.*.items.*.item_text": "text-delta",
        "sections.*.items.*": "set",
      },
    },
  });

  const canvas: DiscoveryCanvasResponse = result.output ?? {
    title: "",
    facilitator_style_id: null,
    canvas_mode: "DISCOVERY_WORKSHOP",
    intro: { label: "", summary: "", item_text: "" },
    sections: {},
  };

  const sectionsCount = Object.keys(canvas.sections).length;
  const totalItems = Object.values(canvas.sections).reduce(
    (sum, section) => sum + Object.keys(section.items).length,
    0,
  );

  emitDiscoveryCanvasThinkingFinish({
    streamId: THINKING_STREAM_ID,
    payload: { canvas },
  });

  console.log("[create-canvas] done", {
    parsedOk: Boolean(result.output),
    sectionsCount,
    totalItems,
    title: canvas.title.slice(0, 80),
    facilitatorStyleId: canvas.facilitator_style_id,
    canvasMode: canvas.canvas_mode,
    introItem: canvas.intro.item_text.slice(0, 80),
    warnings: result.warnings,
  });

  return {
    data: { canvas },
  };
};
