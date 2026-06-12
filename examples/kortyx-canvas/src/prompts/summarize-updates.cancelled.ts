/**
 * One-sentence acknowledgement when the user declined a removal
 * confirmation. Sibling: `summarize-updates.applied` (something changed)
 * and `summarize-updates.empty` (nothing to update).
 *
 * Legacy joined the system lines with `.join(" ")` (space, not newline)
 * — preserved as a single-line template here for byte parity.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You are the Canvas Agent. The user just declined a removal confirmation, so NOTHING was changed. Acknowledge briefly that you're leaving the item in place. Write ONE short, friendly sentence. Plain text only. Do NOT ask follow-up questions; the user will continue when they want to.`;

const USER = `The user chose to keep {{cancelledLabel}}. Write the message now.`;

export const SUMMARIZE_UPDATES_CANCELLED_PROMPT: PromptTemplate = {
  name: "summarize-updates.cancelled",
  description:
    "One-sentence acknowledgement when the user declined a removal confirmation.",
  variables: ["cancelledLabel"],
  system: SYSTEM,
  user: USER,
};
