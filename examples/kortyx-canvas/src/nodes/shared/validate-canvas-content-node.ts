import "server-only";

import { google } from "@kortyx/google";
import { useReason, useRuntimeContext } from "kortyx";
import type { CanvasAgentContext } from "@/lib/runtime-context";
import {
  canvasHasContent,
  serializeDiscoveryCanvasForPrompt,
} from "../../lib/serialize-canvas";
import { loadPrompt } from "../../prompts/_registry";
import {
  canvasValidationResultSchema,
  type DiscoveryCanvasValidationResult,
} from "../../schemas/canvas-validation";
import type { DiscoveryCanvasResponse } from "../../schemas/discovery-canvas";

type ValidateDiscoveryCanvasContentInput = {
  /**
   * Optional override — pass the canvas-creation node's just-generated canvas
   * straight in so we don't have to round-trip it through runtime context.
   * When omitted, falls back to `ctx.currentDiscoveryCanvas` (used by the save flow,
   * where the canvas arrives via the client transport).
   */
  canvas?: DiscoveryCanvasResponse;
};

/**
 * Shared validator node — runs the EU AI Act / non-discrimination prompt
 * against the current canvas state. Used in two workflows:
 *
 *   - `canvas-creation`: as a soft annotation pass after `createDiscoveryCanvas`, so the
 *     summarizer can call out anything that slipped through the generator's
 *     own guardrails.
 *   - `canvas-save`: as a hard gate before persistence — workflow edges route
 *     to the responder node directly when `pass === false`, skipping the
 *     save call.
 *
 * Emits no chat output of its own. The structured violation list is passed
 * forward on `data` for downstream nodes to format conversationally.
 */
export const validateDiscoveryCanvasContentNode = async ({
  input,
}: {
  input?: ValidateDiscoveryCanvasContentInput;
}) => {
  const ctx = useRuntimeContext<CanvasAgentContext>();
  const canvas = input?.canvas ?? ctx.currentDiscoveryCanvas;
  if (!canvasHasContent(canvas)) {
    // Empty draft has nothing to audit. Treat as a pass — the save node will
    // reject the empty payload with its own "at least one section" error.
    return {
      condition: "ok",
      data: {
        validation: {
          pass: true,
          violations: [],
        } as DiscoveryCanvasValidationResult,
      },
    };
  }

  const { system, user } = loadPrompt("validate-canvas-content", {
    canvasBlock: serializeDiscoveryCanvasForPrompt(canvas),
  });

  const result = await useReason<DiscoveryCanvasValidationResult>({
    id: "validate-canvas-content",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    outputSchema: canvasValidationResultSchema,
    responseFormat: { type: "json" },
    temperature: 0.1,
    emit: false,
  });

  const validation: DiscoveryCanvasValidationResult = result.output ?? {
    pass: true,
    violations: [],
  };

  console.log("[validate-canvas-content] done", {
    pass: validation.pass,
    violationCount: validation.violations.length,
    categories: validation.violations.map((v) => v.category),
  });

  return {
    condition: validation.pass ? "ok" : "blocked",
    data: { validation },
  };
};
