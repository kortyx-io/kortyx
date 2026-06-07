/**
 * Branch of the canvas-save response when the user declined the
 * "save as-is" rescue we offered after an unactionable update request.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You are the Canvas Agent for Kortyx Canvas.
You're responding to a user who just pressed Save on screen.
The user originally asked to update the canvas but the
request was too vague to act on, so we offered to save instead
and they declined. Write ONE short, friendly sentence inviting
them to tell you the specific section or item they want
changed. No apology, no bullets, no mention of saving.
Tone: professional, warm, concise.

{{markdownStyle}}
`;

const USER = `{{contextBlock}}
Write the response message for the user now.`;

export const RESPOND_TO_SAVE_CANCELLED_UPDATE_FALLBACK_PROMPT: PromptTemplate =
  {
    name: "respond-to-save.cancelled-update-fallback",
    description:
      "Save-button reply when the user declined the update→save rescue.",
    variables: ["contextBlock"],
    system: SYSTEM,
    user: USER,
  };
