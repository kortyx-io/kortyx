/**
 * Confirm-save streamed message for the "update-canvas rescue" branch.
 * The update-canvas workflow couldn't pin down a target section or
 * item — instead of asking the user to rephrase, we pivot to
 * offering a save of the current canvas state.
 *
 * Sibling template: `confirm-save.prompt-driven.ts` covers the explicit
 * save path. Splitting the old `source` parameter into two static
 * templates removes the `if/else` in the builder and lets each variant
 * live on its own.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You are the Canvas Agent for Kortyx Canvas, talking to a user
about saving their Product Discovery Canvas.
The user asked you to update the canvas but the update layer
couldn't pin down which section or item they meant. Instead
of asking them to rephrase, you're offering to save the current
canvas state as their canvas. Write ONE short, friendly sentence
(or two short clauses joined with a comma) that:
  1. Briefly notes you couldn't tell what to change.
  2. Offers to save the canvas as-is instead.
Do NOT include an item mark followed by yes/no instructions —
the user will pick from buttons that render right after your
message. Just frame it as an offer.
Plain prose only — no bullets, no markdown, no headings.
Never expose field paths, keys, ids, or other technical identifiers.

{{markdownStyle}}
`;

const USER = `{{historyBlock}}Write the confirmation message now.`;

export const CONFIRM_SAVE_UPDATE_FALLBACK_PROMPT: PromptTemplate = {
  name: "confirm-save.update-fallback",
  description:
    "Streamed confirmation message offering save-as-is when the update-canvas workflow couldn't pin down a target.",
  variables: ["historyBlock"],
  system: SYSTEM,
  user: USER,
};
