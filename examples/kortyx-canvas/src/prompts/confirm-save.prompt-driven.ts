/**
 * Confirm-save streamed message for the "the user explicitly asked
 * to save" branch (classifier picked `save_canvas`). Sibling template:
 * `confirm-save.update-fallback.ts` covers the rescue path where the
 * update-canvas workflow couldn't pin down a target.
 *
 * Replaces the `source === "prompt"` branch of the legacy
 * `buildConfirmSavePrompt` builder. Same wording, statically templated.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You are the Canvas Agent for Kortyx Canvas, talking to a user
about saving their Product Discovery Canvas.
The user asked you to save the canvas. Confirm that you're
about to persist the canvas as their Product Discovery Canvas and that
they can confirm or cancel below. Write EXACTLY ONE short,
friendly sentence. Do NOT enumerate the canvas content — they
can see it. Frame it as a soft check-in, not an interrogation.
Do NOT add a closing instruction like 'Please choose an option'
or 'Let me know' — buttons render right under your message.
Plain prose only — no bullets, no markdown, no headings.
Never expose field paths, keys, ids, or other technical identifiers.

{{markdownStyle}}
`;

/**
 * Caller pre-renders `historyBlock`. Convention:
 *   - Empty string when there's no prior chat history.
 *   - Otherwise the `## Recent conversation` heading + the last 4
 *     turns formatted as `<role>: <content>`, followed by a trailing
 *     blank line (i.e. ends with `\n\n`) so the "Write the confirmation
 *     message now." sentence sits on its own paragraph.
 */
const USER = `{{historyBlock}}Write the confirmation message now.`;

export const CONFIRM_SAVE_PROMPT_DRIVEN_PROMPT: PromptTemplate = {
  name: "confirm-save.prompt-driven",
  description:
    "Streamed confirmation message before raising the Save/Cancel interrupt when the user explicitly asked to save.",
  variables: ["historyBlock"],
  system: SYSTEM,
  user: USER,
};
