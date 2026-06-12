import "server-only";

import { google } from "@kortyx/google";
import { useReason, useRuntimeContext } from "kortyx";
import { WORKFLOW_IDS } from "@/lib/protocol";
import type {
  CanvasAgentContext,
  ChatHistoryMessage,
  CurrentDiscoveryCanvasContext,
} from "@/lib/runtime-context";
import { getBriefById, getLocalizedBriefContent } from "@/services/demo-data";
import {
  canvasHasContent,
  formatDiscoveryCanvasForChat,
} from "../../lib/serialize-canvas";
import {
  formatHistoryVerbatim,
  serializeHistoryForPrompt,
} from "../../lib/serialize-history";
import { loadPrompt } from "../../prompts/_registry";
import { type ChatIntent, chatIntentSchema } from "../../schemas/chat-intent";

const DEMO_LANGUAGE = "en";

type ChatNodeParams = {
  temperature?: number;
};

export const chatNode = async ({
  input,
  params,
}: {
  input: unknown;
  params: ChatNodeParams;
}) => {
  const userText = String(input ?? "").trim();
  const ctx = useRuntimeContext<CanvasAgentContext>();
  const currentDiscoveryCanvas = ctx.currentDiscoveryCanvas;
  const history = ctx.history ?? [];
  const hasDiscoveryCanvas = canvasHasContent(currentDiscoveryCanvas);

  const { system: classifySystem, user: classifierInput } = loadPrompt(
    hasDiscoveryCanvas
      ? "classify-chat-intent.with-canvas"
      : "classify-chat-intent.no-canvas",
    { userPayload: buildClassifierInput({ userText, history }) },
  );

  const classification = await useReason<{ intent: ChatIntent }>({
    id: "classify-intent",
    model: google("gemini-2.5-flash"),
    system: classifySystem,
    input: classifierInput,
    outputSchema: chatIntentSchema,
    responseFormat: { type: "json" },
    emit: false,
  });

  const intent = classification.output?.intent ?? "general_chat";

  console.log("[chat-node] classified", {
    userText,
    intent,
    hasDiscoveryCanvas,
    historyLength: history.length,
    classifierText: classification.text,
    classifierOutput: classification.output,
  });

  if (intent === "create_canvas") {
    console.log("[chat-node] handing off to canvas-creation");
    return { transitionTo: WORKFLOW_IDS.canvasCreation };
  }

  if (intent === "find_brief") {
    console.log("[chat-node] handing off to brief-query");
    return { transitionTo: WORKFLOW_IDS.briefQuery };
  }

  if (intent === "update_canvas" && hasDiscoveryCanvas) {
    console.log("[chat-node] handing off to update-canvas");
    return { transitionTo: WORKFLOW_IDS.updateDiscoveryCanvas };
  }

  if (intent === "save_canvas" && hasDiscoveryCanvas) {
    // Prompt-driven save. The save workflow will ask the user to
    // confirm via an interrupt before persisting since `ctx.saveConfirmed`
    // is undefined (only the canvas Save button sets it).
    console.log("[chat-node] handing off to canvas-save (will confirm)");
    return { transitionTo: WORKFLOW_IDS.canvasSave };
  }

  const briefBlock = await loadJobBlock({
    tenantId: ctx.tenantId,
    briefId: ctx.briefId,
    briefLabel: ctx.briefLabel,
  });

  const systemPrompt = buildChatSystemPrompt({
    canvas: currentDiscoveryCanvas,
    history,
    briefBlock,
  });

  const result = await useReason({
    id: "chat-response",
    model: google("gemini-2.5-flash"),
    system: systemPrompt,
    input: userText,
    temperature: params.temperature ?? 0.3,
    stream: true,
    emit: true,
  });

  return {
    data: {
      intent,
      text: result.text,
    },
  };
};

/**
 * The classifier needs prior turns to route short follow-up replies
 * correctly. Without history, an answer like "Technical Acumen — this
 * section" to a prior "which section?" clarification gets misread
 * as small talk and the workflow never hands off to update-canvas.
 */
function buildClassifierInput({
  userText,
  history,
}: {
  userText: string;
  history: ChatHistoryMessage[];
}): string {
  const safeText = userText || "(empty message)";
  if (history.length === 0) return safeText;
  return [
    "## Recent conversation (oldest → newest)",
    serializeHistoryForPrompt(history),
    "",
    "## Latest user message to classify",
    safeText,
  ].join("\n");
}

function buildChatSystemPrompt({
  canvas,
  history,
  briefBlock,
}: {
  canvas: CurrentDiscoveryCanvasContext | undefined;
  history: ChatHistoryMessage[];
  briefBlock: string | null;
}): string {
  const { system } = loadPrompt("chat-response", {
    briefBlock: briefBlock ? `\n\n${briefBlock}` : "",
    canvasBlock: canvasHasContent(canvas)
      ? `\n\n## Current Product Discovery Canvas\n${formatDiscoveryCanvasForChat(canvas)}`
      : "",
    historyBlock:
      history.length > 0
        ? `\n\n## Recent conversation (oldest → newest)\n${formatHistoryVerbatim(history)}`
        : "",
  });
  return system;
}

/**
 * When the user has a brief in focus (set by the brief-query workflow,
 * the picker flow, or carried over from a canvas creation), load its full
 * description and inline it so general-chat can answer detail items
 * ("what changed?", "what evidence is missing?") without bouncing
 * back through a workflow.
 *
 * Returns `null` when there's nothing to inject, so the prompt stays
 * lean for plain-chat turns.
 */
async function loadJobBlock(args: {
  tenantId: string;
  briefId: string | undefined;
  briefLabel: string | undefined;
}): Promise<string | null> {
  if (!args.briefId) {
    console.log("[chat-node] no brief in focus");
    return null;
  }
  const result = await getBriefById(args.tenantId, args.briefId);
  if (result.error || !result.data) {
    console.warn("[chat-node] failed to load brief in focus", {
      briefId: args.briefId,
      error: result.error,
    });
    return null;
  }
  const localized = getLocalizedBriefContent(
    result.data.translations,
    DEMO_LANGUAGE,
  );
  console.log("[chat-node] injecting brief in focus", {
    briefId: args.briefId,
    descriptionLength: localized.description?.length ?? 0,
  });
  const title = localized.title || args.briefLabel || "(untitled)";
  const description = localized.description?.trim();
  const lines = [`## Current brief in focus`, `Title: ${title}`];
  if (localized.companyName) {
    lines.push(`Company: ${localized.companyName}`);
  }
  if (description) {
    lines.push("", "Full description:", description);
  }
  return lines.join("\n");
}
