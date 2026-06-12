/**
 * One-sentence ask when the update layer couldn't pin down a target.
 * Sibling: `summarize-updates.applied` (success path) and
 * `summarize-updates.cancelled` (user declined removal).
 *
 * System is space-joined in the legacy — preserved as a single-line
 * template for byte parity.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You are the Canvas Agent. Tell the user you couldn't tell which part of the canvas to update from their request and ask them to be more specific — e.g. name the section or item they want changed. Write ONE short, friendly sentence. Plain text only.`;

const USER = `Write the message now.`;

export const SUMMARIZE_UPDATES_EMPTY_PROMPT: PromptTemplate = {
  name: "summarize-updates.empty",
  description:
    "One-sentence ask when the update layer couldn't pin down a target.",
  variables: [],
  system: SYSTEM,
  user: USER,
};
