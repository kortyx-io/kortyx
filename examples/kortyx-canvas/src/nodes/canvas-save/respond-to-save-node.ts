import "server-only";

import { google } from "@kortyx/google";
import { useReason } from "kortyx";
import { loadPrompt, type PromptName } from "../../prompts/_registry";
import type { DiscoveryCanvasValidationResult } from "../../schemas/canvas-validation";
import type {
  SaveCancellationReason,
  SaveDiscoveryCanvasOutcome,
} from "./types";

type RespondToSaveNodeInput = {
  validation?: DiscoveryCanvasValidationResult;
  outcome?: SaveDiscoveryCanvasOutcome;
  /**
   * Set by `confirmSaveNode` when the user declined the Save/Cancel
   * interrupt (or the canvas was empty). Routes the prompt to a
   * cancellation message instead of pretending a save attempt was made.
   * See {@link SaveCancellationReason} for the full list.
   */
  cancellationReason?: SaveCancellationReason;
};

type RespondToSaveNodeParams = {
  temperature?: number;
};

/**
 * Terminal node of the canvas-save workflow. Reads the validator's result
 * and (optionally) the persistence outcome from upstream workflow state and
 * streams a conversational response back into the chat — success, validation
 * block, or save error.
 *
 * Uses `useReason` so the response copy can account for the full save
 * outcome rather than relying on static strings.
 */
export const respondToSaveNode = async ({
  input,
  params,
}: {
  input: RespondToSaveNodeInput;
  params: RespondToSaveNodeParams;
}) => {
  const promptName = pickRespondToSavePrompt({
    validation: input?.validation,
    outcome: input?.outcome,
    cancellationReason: input?.cancellationReason,
  });
  const { system, user } = loadPrompt(promptName, {
    contextBlock: renderRespondToSaveContextBlock({
      validation: input?.validation,
      outcome: input?.outcome,
    }),
  });

  console.log("[respond-to-save] start", {
    validationPass: input?.validation?.pass,
    violationCount: input?.validation?.violations.length ?? 0,
    saveSuccess: input?.outcome?.success,
    cancellationReason: input?.cancellationReason,
  });

  const result = await useReason({
    id: "respond-to-save",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    temperature: params.temperature ?? 0.4,
    stream: true,
    emit: true,
  });

  return {
    data: { responseText: result.text },
  };
};

/**
 * Routes the save flow to one of seven `respond-to-save.*` static
 * prompts based on the input shape. Branch precedence mirrors the
 * legacy builder's `if/else` chain so the choice is deterministic.
 */
function pickRespondToSavePrompt(args: {
  validation: DiscoveryCanvasValidationResult | undefined;
  outcome: SaveDiscoveryCanvasOutcome | undefined;
  cancellationReason: SaveCancellationReason | undefined;
}): PromptName {
  if (args.cancellationReason === "empty-canvas") {
    return "respond-to-save.cancelled-empty-canvas";
  }
  if (args.cancellationReason === "update-fallback-declined") {
    return "respond-to-save.cancelled-update-fallback";
  }
  if (args.cancellationReason) {
    return "respond-to-save.cancelled-other";
  }
  if ((args.validation?.violations.length ?? 0) > 0) {
    return "respond-to-save.validation-failed";
  }
  if (args.outcome?.success === false) {
    return "respond-to-save.save-errored";
  }
  if (args.outcome?.success === true) {
    return "respond-to-save.save-succeeded";
  }
  return "respond-to-save.no-outcome";
}

/**
 * Pre-renders the XML context block (`<violations>`, `<save_error>`,
 * `<saved>`) for the active branch. Returns the empty string when no
 * structured context is required (cancelled / no-outcome branches).
 */
function renderRespondToSaveContextBlock(args: {
  validation: DiscoveryCanvasValidationResult | undefined;
  outcome: SaveDiscoveryCanvasOutcome | undefined;
}): string {
  const validationFailed = (args.validation?.violations.length ?? 0) > 0;
  const saveSucceeded = args.outcome?.success === true;
  const saveErrored = args.outcome?.success === false;
  const lines: string[] = [];
  if (validationFailed && args.validation) {
    lines.push("<violations>");
    for (const v of args.validation.violations) {
      lines.push(
        `  - field: ${v.path} | category: ${v.category} | excerpt: ${v.excerpt} | concern: ${v.explanation} | suggestion: ${v.suggestion}`,
      );
    }
    lines.push("</violations>");
  }
  if (saveErrored && args.outcome && args.outcome.success === false) {
    lines.push("<save_error>");
    lines.push(`  ${args.outcome.error}`);
    lines.push("</save_error>");
  }
  if (saveSucceeded && args.outcome && args.outcome.success === true) {
    lines.push("<saved>");
    lines.push(`  canvasId: ${args.outcome.canvasId}`);
    lines.push(`  title: ${args.outcome.title}`);
    lines.push(`  mode: ${args.outcome.isUpdate ? "update" : "create"}`);
    lines.push("</saved>");
  }
  if (lines.length === 0) return "";
  return `${lines.join("\n")}\n`;
}
