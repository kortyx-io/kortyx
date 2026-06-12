import "server-only";

import { google } from "@kortyx/google";
import { useReason } from "kortyx";
import {
  extractUserText,
  type ForwardableInput,
} from "../../lib/extract-user-text";
import { loadPrompt } from "../../prompts/_registry";
import type { ScreenUpdateIntentResult } from "../../schemas/canvas-validation";

type AckInput =
  | ForwardableInput
  | { userText?: string; screen?: ScreenUpdateIntentResult };

type AckParams = {
  temperature?: number;
};

/**
 * Sits between `screenUpdateIntent` (on the `ok` route) and
 * `classifyUpdateOp`. Streams ONE short, deliberately vague sentence so
 * the user sees activity before the silent classify + path-find
 * chain runs.
 *
 * Why this lives AFTER the policy screen, not before it:
 *   - blocked turns route to `respondToPolicyRefusal` and never see this
 *     node, so we don't ack something we're about to refuse.
 *
 * Why the wording stays vague:
 *   - `findUpdatePaths` can still redirect to `canvas-save` when it can't
 *     pin down a target. A "Got it, updating now" message would read as
 *     a lie right before a Save/Cancel prompt. "Taking a look at the
 *     canvas" stays true across every downstream branch.
 *
 * Uses `useReason({ stream: true, emit: true })` so the sentence types
 * out live, matching the rest of the agent's chat surface.
 */
export const acknowledgeUpdateIntentNode = async ({
  input,
  params,
}: {
  input: AckInput;
  params: AckParams;
}) => {
  const userText = extractUserText(input as ForwardableInput);
  const screen =
    input && typeof input === "object" && "screen" in input
      ? input.screen
      : undefined;

  const { system, user } = loadPrompt("acknowledge-update-intent", {});

  const result = await useReason({
    id: "acknowledge-update-intent",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    temperature: params.temperature ?? 0.6,
    stream: true,
    emit: true,
  });

  console.log("[acknowledge-update-intent] done", {
    chars: result.text.length,
  });

  return { data: { userText, screen } };
};
