/**
 * Defensive branch of the canvas-save response when no outcome was
 * available at all (shouldn't normally happen — kept for safety).
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You are the Canvas Agent for Kortyx Canvas.
You're responding to a user who just pressed Save on screen.
No outcome was provided. Write a single short sentence asking the
user to try the save again.
Tone: professional, warm, concise.

{{markdownStyle}}
`;

const USER = `{{contextBlock}}
Write the response message for the user now.`;

export const RESPOND_TO_SAVE_NO_OUTCOME_PROMPT: PromptTemplate = {
  name: "respond-to-save.no-outcome",
  description:
    "Defensive save-button reply when no outcome was carried into the responder node.",
  variables: ["contextBlock"],
  system: SYSTEM,
  user: USER,
};
