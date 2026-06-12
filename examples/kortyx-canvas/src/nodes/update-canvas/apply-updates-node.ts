import "server-only";

import { google } from "@kortyx/google";
import { useReason, useRuntimeContext } from "kortyx";
import type { CanvasAgentContext } from "@/lib/runtime-context";
import { listFacilitatorStyles } from "@/services/demo-data";
import { formatFacilitatorStylesForPrompt } from "../../lib/format-facilitator-styles";
import {
  buildLlmPatchStreamFields,
  patchesRecordFromOps,
  toPatchRecordKey,
} from "../../lib/patch-record-key";
import { readDiscoveryCanvasPath } from "../../lib/read-path";
import { loadPrompt } from "../../prompts/_registry";
import {
  type LlmPatch,
  llmPatchesSchema,
  type SetOp,
  type UpdateTarget,
} from "../../schemas/canvas-ops";
import { CANVAS_PATCHES_STREAM_META } from "../../streaming/canvas-patches";
import {
  emitDiscoveryCanvasThinkingFinish,
  emitDiscoveryCanvasThinkingStart,
} from "../../streaming/canvas-thinking";

/** @deprecated kept for older imports — use {@link SetOp} from `schemas/canvas-ops`. */
export type DiscoveryCanvasPatch = SetOp;

type ApplyUpdatesInput = {
  updates?: UpdateTarget[];
};

type ApplyUpdatesParams = {
  temperature?: number;
};

const THINKING_STREAM_ID = "apply-updates-thinking";

/**
 * Second step of the update-canvas workflow's `update_field` branch. Given
 * the `updates` extracted by `findUpdatePathsNode`, asks the model to
 * rewrite each target's value in a single batched call.
 * `useReason({ structured.fields })` streams every completed patch as a
 * `structured-data` chunk so the canvas updates progressively as each
 * rewrite finishes — no separate `useStructuredData` fan-out needed.
 *
 * The client tracks applied patches by record key per streamId and reuses the
 * existing `updateIntro/updateSection/updateItem` canvas-store
 * mutators.
 */
export const applyUpdatesNode = async ({
  input,
  params,
}: {
  input: ApplyUpdatesInput;
  params: ApplyUpdatesParams;
}) => {
  const updates = input?.updates ?? [];
  if (updates.length === 0) {
    console.log("[apply-updates] no targets — skipping LLM call");
    return { data: { patches: [] } };
  }

  const ctx = useRuntimeContext<CanvasAgentContext>();
  const canvas = ctx.currentDiscoveryCanvas;
  if (!canvas) {
    throw new Error(
      "applyUpdatesNode: missing currentDiscoveryCanvas in runtime context",
    );
  }

  // Only fetch facilitatorStyles when at least one target writes `facilitator_style_id`. Keeps
  // the common case (text rewrite) a single LLM call, and avoids burning a
  // core-api round-trip on every chat turn.
  const needsFacilitatorStyles = updates.some(
    (u) => u.path === "facilitator_style_id",
  );
  const availableFacilitatorStyles = needsFacilitatorStyles
    ? formatFacilitatorStylesForPrompt(
        ctx.tenantId
          ? ((
              await listFacilitatorStyles(ctx.tenantId, {
                includeArchived: false,
              })
            ).data ?? [])
          : [],
      )
    : "(none)";

  const updatesBlock = updates
    .map((u, i) => {
      const current = readDiscoveryCanvasPath(canvas, u.path) ?? "(empty)";
      return [
        `### Update ${i + 1}`,
        `patchKey: ${toPatchRecordKey(u.path)}`,
        `path: ${u.path}`,
        `label: ${u.label}`,
        `instruction: ${u.instruction}`,
        `current value: ${current}`,
      ].join("\n");
    })
    .join("\n\n");

  const { system, user } = loadPrompt("apply-updates", {
    availableFacilitatorStyles,
    updatesBlock,
  });

  console.log("[apply-updates] start", {
    targetCount: updates.length,
    paths: updates.map((u) => u.path),
  });

  // Emit the thinking-pill marker BEFORE the LLM call so the UI shows the
  // shimmer + timer the moment this node starts, not when the first patch
  // chunk lands.
  emitDiscoveryCanvasThinkingStart({
    streamId: THINKING_STREAM_ID,
    phase: "update",
  });

  const result = await useReason<{ patches: Record<string, LlmPatch> }>({
    id: "apply-updates",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    outputSchema: llmPatchesSchema,
    responseFormat: { type: "json" },
    temperature: params.temperature ?? 0.4,
    stream: true,
    emit: true,
    // Stream each patch as the model finishes it so the canvas updates
    // progressively. Keys are derived from the target path (e.g.
    // `patches.intro__item_text.value`) so the reducer never creates
    // numeric array segments like `patches.7.value`.
    structured: {
      ...CANVAS_PATCHES_STREAM_META,
      fields: buildLlmPatchStreamFields(updates.map((u) => u.path)),
    },
  });

  // Map LLM output back onto the requested targets so we don't lose entries
  // if the model drops one. Falls back to the request's path/label/
  // instruction. We add `op: "set"` server-side so downstream nodes and
  // the client see canonical `DiscoveryCanvasOp` shapes; the LLM is never asked to
  // emit the discriminator (every patch from this node is a "set" by
  // construction).
  const patches: SetOp[] = updates.map((target) => {
    const out = result.output?.patches?.[toPatchRecordKey(target.path)];
    return {
      op: "set" as const,
      path: out?.path && out.path.length > 0 ? out.path : target.path,
      label: out?.label && out.label.length > 0 ? out.label : target.label,
      value: typeof out?.value === "string" ? out.value : "",
      reason:
        out?.reason && out.reason.length > 0 ? out.reason : target.instruction,
    };
  });

  const cleanPatches = patches.filter(
    (p) => p.path.length > 0 && p.value.length > 0,
  );

  emitDiscoveryCanvasThinkingFinish({
    streamId: THINKING_STREAM_ID,
    payload: { patches: patchesRecordFromOps(cleanPatches) },
  });

  console.log("[apply-updates] done", {
    emitted: cleanPatches.length,
    dropped: patches.length - cleanPatches.length,
  });

  return { data: { patches: cleanPatches } };
};
