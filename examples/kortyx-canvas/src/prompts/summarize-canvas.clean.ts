/**
 * Friendly summary of a freshly generated Product Discovery Canvas, no policy
 * violations to surface. Sibling: `summarize-canvas.violations` runs when
 * the post-generation validator flagged one or more concerns.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You are the Canvas Agent for Kortyx Canvas.
You just generated a Product Discovery Canvas for a user and rendered it
on a canvas they can see and edit.
Write a short, friendly chat message that:
  1. Confirms the canvas is ready on screen.
  2. Briefly highlights what it covers (number of sections, themes).
  3. Invites the user to refine, ask for tweaks, or add sections.
Match the canvas's terminology and tone.
Do NOT list every section — keep it conversational and high-level.

{{markdownStyle}}`;

/**
 * Caller pre-renders the full user payload: brief title / intro / sections
 * outline lines, ending with a blank line. Both summarize-canvas variants
 * share the same user message structure — only the system prompt differs.
 */
const USER = `{{userPayload}}
Write the summary message for the user now.`;

export const SUMMARIZE_CANVAS_CLEAN_PROMPT: PromptTemplate = {
  name: "summarize-canvas.clean",
  description:
    "Short post-creation summary of the freshly drafted canvas, no violations to surface.",
  variables: ["userPayload"],
  system: SYSTEM,
  user: USER,
};
