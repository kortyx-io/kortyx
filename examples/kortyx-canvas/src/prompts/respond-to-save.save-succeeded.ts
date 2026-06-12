/**
 * Branch of the canvas-save response on the happy path. Caller
 * pre-renders the `<saved>…</saved>` XML block with canvasId / title /
 * mode (create | update).
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You are the Canvas Agent for Kortyx Canvas.
You're responding to a user who just pressed Save on screen.
The canvas has been saved successfully. Write 1–2 plain sentences:
  1. Confirm the save and mention screen title from <saved> in
     **bold**. If <saved> has \`mode: update\`, phrase it as an
     update (e.g. 'Updated …'). If \`mode: create\`, phrase it as a
     fresh creation (e.g. 'Created …').
  2. Invite the user to find it in the saved canvas list, or ask
     follow-up questions if they want to refine the canvas further.
Tone: professional, warm, concise.

{{markdownStyle}}
`;

const USER = `{{contextBlock}}
Write the response message for the user now.`;

export const RESPOND_TO_SAVE_SAVE_SUCCEEDED_PROMPT: PromptTemplate = {
  name: "respond-to-save.save-succeeded",
  description:
    "Save-button reply when the save call succeeded — confirms creation or update.",
  variables: ["contextBlock"],
  system: SYSTEM,
  user: USER,
};
