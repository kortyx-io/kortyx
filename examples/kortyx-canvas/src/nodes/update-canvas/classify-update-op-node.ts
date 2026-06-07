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
  classifyUpdateOpSchema,
  type UpdateOpKind,
} from "../../schemas/canvas-ops";

/**
 * Second step of the update-canvas workflow. Decides which structural
 * branch the user's request falls under and returns a kortyx `condition`
 * matching one of the workflow's `{ when }` edges. `data.userText` is
 * forwarded so the downstream branch nodes still see the raw request.
 */
export const classifyUpdateOpNode = async ({
  input,
}: {
  input: ForwardableInput;
}) => {
  const ctx = useRuntimeContext<CanvasAgentContext>();
  const userText = extractUserText(input);
  const { system, user } = loadPrompt("classify-update-op", {
    historyBlock: serializeHistoryForPrompt(ctx.history ?? []),
    userText: userText || "(empty message)",
  });

  const result = await useReason<{ op: UpdateOpKind }>({
    id: "classify-update-op",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    outputSchema: classifyUpdateOpSchema,
    responseFormat: { type: "json" },
    emit: false,
  });

  const op: UpdateOpKind = result.output?.op ?? "update_field";

  console.log("[classify-update-op] done", { userText, op });

  return {
    condition: op,
    data: { userText, op },
  };
};
