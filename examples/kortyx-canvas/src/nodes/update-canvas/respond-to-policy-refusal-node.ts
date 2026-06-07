import "server-only";

import { google } from "@kortyx/google";
import { useReason } from "kortyx";
import { loadPrompt } from "../../prompts/_registry";
import type { ScreenUpdateIntentResult } from "../../schemas/canvas-validation";

type RespondToPolicyRefusalInput = {
  userText?: string;
  screen?: ScreenUpdateIntentResult;
};

type RespondToPolicyRefusalParams = {
  temperature?: number;
};

/**
 * Terminal node of the blocked branch of the update-canvas workflow.
 * Streams a polite refusal back into chat without ever invoking the
 * generative branches. Mirrors `respondToSaveNode`'s structure so chat
 * UX (streaming) stays consistent across all "policy stop"
 * surfaces.
 */
export const respondToPolicyRefusalNode = async ({
  input,
  params,
}: {
  input: RespondToPolicyRefusalInput;
  params: RespondToPolicyRefusalParams;
}) => {
  const screen: ScreenUpdateIntentResult = input?.screen ?? {
    result: "FAIL",
    category: "NON_DISCRIMINATION",
    excerpt: null,
    explanation: null,
  };

  const { system, user } = loadPrompt("respond-to-policy-refusal", {
    category: screen.category ?? "NON_DISCRIMINATION",
    excerpt: screen.excerpt ?? "(not provided)",
    explanation: screen.explanation ?? "(not provided)",
    userText: (input?.userText ?? "") || "(empty message)",
  });

  console.log("[respond-to-policy-refusal] start", {
    category: screen.category,
    excerpt: screen.excerpt,
  });

  const result = await useReason({
    id: "respond-to-policy-refusal",
    model: google("gemini-2.5-flash"),
    system,
    input: user,
    temperature: params.temperature ?? 0.3,
    stream: true,
    emit: true,
  });

  return { data: { responseText: result.text, refusal: screen } };
};
