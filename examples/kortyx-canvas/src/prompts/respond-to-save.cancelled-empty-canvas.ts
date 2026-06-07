/**
 * Branch of the canvas-save response when the user asked to save
 * with an empty canvas. Sibling templates live under
 * `respond-to-save.*` and share the same user shape
 * (`{{contextBlock}}\nWrite the response message for the user now.`).
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You are the Canvas Agent for Kortyx Canvas.
You're responding to a user who just pressed Save on screen.
The user asked to save but the canvas is empty. Write ONE
short sentence telling them there's nothing to save yet and
inviting them to generate or draft a canvas first. No bullets.
Tone: professional, warm, concise.

{{markdownStyle}}
`;

const USER = `{{contextBlock}}
Write the response message for the user now.`;

export const RESPOND_TO_SAVE_CANCELLED_EMPTY_CANVAS_PROMPT: PromptTemplate = {
  name: "respond-to-save.cancelled-empty-canvas",
  description:
    "Save-button reply when the user pressed Save with an empty canvas.",
  variables: ["contextBlock"],
  system: SYSTEM,
  user: USER,
};
