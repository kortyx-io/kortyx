import "server-only";

import { google } from "@kortyx/google";
import { useReason } from "kortyx";
import { loadPrompt } from "../../prompts/_registry";
import type { CreateDiscoveryCanvasPromptVariables } from "../../prompts/create-canvas";

type AnnounceDiscoveryCanvasCreationInput = {
  promptVars?: CreateDiscoveryCanvasPromptVariables;
};

type AnnounceDiscoveryCanvasCreationParams = {
  temperature?: number;
};

/**
 * Sits between `fetchDiscoveryCanvasInputs` and `createDiscoveryCanvas`. Streams ONE short
 * conversational sentence that names the resolved agent + brief so the
 * user sees context BEFORE the (longer) canvas-generation call kicks
 * off and the thinking pill takes over.
 *
 * Uses `useReason({ stream: true, emit: true })` so the sentence types
 * out live instead of arriving as one block — consistent with the rest
 * of the agent's chat surface. Forwards `promptVars` verbatim so
 * `createDiscoveryCanvas` still receives the same input shape.
 */
export const announceDiscoveryCanvasCreationNode = async ({
  input,
  params,
}: {
  input: AnnounceDiscoveryCanvasCreationInput;
  params: AnnounceDiscoveryCanvasCreationParams;
}) => {
  const promptVars = input?.promptVars;
  if (!promptVars) {
    throw new Error(
      "announceDiscoveryCanvasCreationNode: missing promptVars — run fetchDiscoveryCanvasInputsNode first",
    );
  }

  const { system, user } = loadPrompt("announce-canvas-creation", {
    agentTitle: promptVars.agentTitle,
    briefTitle: promptVars.briefTitle,
  });

  const result = await useReason({
    id: "announce-canvas-creation",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    temperature: params.temperature ?? 0.6,
    stream: true,
    emit: true,
  });

  console.log("[announce-canvas-creation] done", {
    chars: result.text.length,
    agent: promptVars.agentTitle,
    brief: promptVars.briefTitle,
  });

  return { data: { promptVars } };
};
