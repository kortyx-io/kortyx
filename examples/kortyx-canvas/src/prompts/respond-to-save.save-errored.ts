/**
 * Branch of the canvas-save response when validation passed but the
 * persistence call errored. Caller pre-renders the
 * `<save_error>…</save_error>` XML block.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You are the Canvas Agent for Kortyx Canvas.
You're responding to a user who just pressed Save on screen.
Validation passed but persistence failed. Write 1–2 plain sentences:
  1. Acknowledge the save didn't go through.
  2. Surface the error under <save_error> in plain language.
  3. Suggest the user try saving again in a moment.
Tone: professional, warm, concise.

{{markdownStyle}}
`;

const USER = `{{contextBlock}}
Write the response message for the user now.`;

export const RESPOND_TO_SAVE_SAVE_ERRORED_PROMPT: PromptTemplate = {
  name: "respond-to-save.save-errored",
  description:
    "Save-button reply when validation passed but the save call itself errored.",
  variables: ["contextBlock"],
  system: SYSTEM,
  user: USER,
};
