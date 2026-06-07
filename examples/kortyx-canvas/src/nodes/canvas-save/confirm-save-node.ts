import "server-only";

import { google } from "@kortyx/google";
import {
  useInterrupt,
  useNodeState,
  useReason,
  useRuntimeContext,
} from "kortyx";
import { CONFIRM_SAVE_INTERRUPT_ID } from "@/lib/protocol";
import type {
  CanvasAgentContext,
  ChatHistoryMessage,
} from "@/lib/runtime-context";
import { canvasHasContent } from "../../lib/serialize-canvas";
import { loadPrompt } from "../../prompts/_registry";
import { confirmSaveRequestSchema } from "../../schemas/interrupts";
import type { SaveCancellationReason } from "./types";

/**
 * Renders the last few turns of chat history into the exact block the
 * confirm-save user template expects. Returns an empty string when
 * there's no history; otherwise yields the `## Recent conversation`
 * heading + up to four turns + a trailing blank line so the
 * "Write the confirmation message now." sentence in the template lands
 * on its own paragraph.
 *
 * Kept inline (rather than in `lib/`) because the format is specific to
 * the confirm-save user template — other prompts use different history
 * shapes (verbatim, whitespace-normalized, JSON, etc.).
 */
function renderConfirmSaveHistoryBlock(history: ChatHistoryMessage[]): string {
  if (history.length === 0) return "";
  const lines = ["## Recent conversation (oldest → newest)"];
  for (const msg of history.slice(-4)) {
    lines.push(`${msg.role}: ${msg.content}`);
  }
  return `${lines.join("\n")}\n\n`;
}

/**
 * Entry node of the canvas-save workflow. Three paths:
 *
 *   - Empty canvas: short-circuit to the responder with an `empty-canvas`
 *     cancellation. No interrupt, no LLM call.
 *   - Button-driven save (`ctx.saveConfirmed === true`): skip the
 *     confirmation entirely and route to `saveDiscoveryCanvas`. The user
 *     already consented via the canvas UI.
 *   - Prompt-driven save: stream a localized confirmation message via
 *     `useReason`, then raise a chip-only `useInterrupt` for Save/Cancel.
 *     Tone varies based on `ctx.saveTriggerSource` so a redirect from a
 *     vague "update the canvas" reads as a natural pivot.
 *
 * `useNodeState` keeps the `useReason` emit one-shot. As of
 * `@kortyx/hooks@0.17.1` plain `useInterrupt` auto-attaches the hook
 * state patch the same way `useReason({ interrupt })` does, so node
 * state now survives suspension. Before that fix this guard was a
 * silent no-op and the LLM re-streamed on every resume — see the
 * `kortyx-issue-use-interrupt-drops-hook-state.md` writeup at the repo
 * root for the gory details.
 */
export const confirmSaveNode = async () => {
  const ctx = useRuntimeContext<CanvasAgentContext>();

  if (!canvasHasContent(ctx.currentDiscoveryCanvas)) {
    console.log("[confirm-save] empty canvas — short-circuit to cancel");
    return {
      condition: "cancelled",
      data: {
        cancellationReason: "empty-canvas" satisfies SaveCancellationReason,
      },
    };
  }

  if (ctx.saveConfirmed) {
    console.log("[confirm-save] button-driven save, skipping interrupt");
    return { condition: "confirmed" };
  }

  const isUpdateFallback = ctx.saveTriggerSource === "update-fallback";

  const [confirmationStreamed, setConfirmationStreamed] =
    useNodeState<boolean>(false);

  if (!confirmationStreamed) {
    console.log("[confirm-save] streaming confirmation prompt", {
      source: ctx.saveTriggerSource ?? "prompt",
    });

    const { system, user } = loadPrompt(
      isUpdateFallback
        ? "confirm-save.update-fallback"
        : "confirm-save.prompt-driven",
      {
        historyBlock: renderConfirmSaveHistoryBlock(ctx.history ?? []),
      },
    );

    await useReason({
      id: "confirm-save-message",
      model: google("gemini-2.5-flash"),
      system,
      input: user,
      temperature: 0.4,
      stream: true,
      emit: true,
    });

    setConfirmationStreamed(true);
  }

  // Chip-only interrupt — the streamed message above already explained
  // what we're asking, so the renderer skips the inline question
  // paragraph when `question` is empty.
  const response = await useInterrupt({
    id: "confirm-save",
    request: {
      kind: "choice",
      question: "",
      options: [
        { id: "save", label: "Save canvas" },
        { id: "cancel", label: "Cancel" },
      ],
    },
    requestSchema: confirmSaveRequestSchema,
    schemaId: CONFIRM_SAVE_INTERRUPT_ID,
    schemaVersion: "1",
  });

  const picked = Array.isArray(response) ? response[0] : response;
  const approved = picked === "save";

  if (approved) {
    return { condition: "confirmed" };
  }

  return {
    condition: "cancelled",
    data: {
      cancellationReason: (isUpdateFallback
        ? "update-fallback-declined"
        : "user-declined") satisfies SaveCancellationReason,
    },
  };
};
