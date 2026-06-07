import "server-only";

import { google } from "@kortyx/google";
import { useReason, useRuntimeContext } from "kortyx";
import type { CanvasAgentContext } from "@/lib/runtime-context";
import {
  extractUserText,
  type ForwardableInput,
} from "../../lib/extract-user-text";
import { serializeHistoryForPrompt } from "../../lib/serialize-history";
import { loadPrompt } from "../../prompts/_registry";
import {
  type ScreenUpdateIntentResult,
  screenUpdateIntentResultSchema,
} from "../../schemas/canvas-validation";

/**
 * Pre-flight policy screen for the update-canvas workflow. First node in
 * the graph — runs straight from `__start__` and decides whether to route
 * to `respondToPolicyRefusal` (blocked) or `classifyUpdateOp` (the normal
 * generative branches).
 *
 * Uses Gemini Flash with `temperature: 0.1` because the classification
 * decision is deterministic and we don't want creative interpretations
 * of the rule book.
 */
export const screenUpdateIntentNode = async ({
  input,
}: {
  input: ForwardableInput;
}) => {
  const ctx = useRuntimeContext<CanvasAgentContext>();
  const userText = extractUserText(input);

  const { system, user } = loadPrompt("screen-update-intent", {
    historyBlock: serializeHistoryForPrompt(ctx.history ?? []),
    userText: userText || "(empty message)",
  });

  const result = await useReason<ScreenUpdateIntentResult>({
    id: "screen-update-intent",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    outputSchema: screenUpdateIntentResultSchema,
    responseFormat: { type: "json" },
    temperature: 0.1,
    emit: false,
  });

  const screen: ScreenUpdateIntentResult = result.output ?? {
    result: "PASS",
    category: null,
    excerpt: null,
    explanation: null,
  };

  const blocked = screen.result === "FAIL";

  console.log("[screen-update-intent] done", {
    userText,
    result: screen.result,
    category: screen.category,
  });

  return {
    condition: blocked ? "blocked" : "ok",
    data: { userText, screen },
  };
};
