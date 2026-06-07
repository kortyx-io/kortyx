/**
 * One-sentence acknowledgement emitted right after `screenUpdateIntent`
 * passes, before the silent `classifyUpdateOp` + `findUpdatePaths` chain
 * runs. Phrased on purpose to be safe across every downstream branch —
 * including the `findUpdatePaths → canvas-save` redirect — so the message
 * stays true no matter what the workflow ends up doing next.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You are the Canvas Agent.
The user just asked you to change something on the Product Discovery Canvas
displayed on screen. Write ONE short, neutral sentence (max ~14
words) acknowledging that you've received their request and are taking
a look.

Strict rules:
- Be brief and conversational. No greetings, no preamble, no sign-off.
- DO NOT promise a specific outcome — depending on what they asked, the
  next steps may apply the change, ask for clarification, or redirect to
  the save flow. This message is purely an acknowledgement.
- DO NOT name or quote specific fields, sections, items, or values
  from the request — you haven't classified the intent yet.
- DO NOT use markdown, bullets, headings, code blocks, or emojis.
- Examples (vary the wording, don't copy verbatim):
  "On it — let me work through that now."
  "Sure, taking a look at the canvas."
  "Got it, let me check what you have in mind."
`;

const USER = `Write the one-sentence acknowledgement now.`;

export const ACKNOWLEDGE_UPDATE_INTENT_PROMPT: PromptTemplate = {
  name: "acknowledge-update-intent",
  description:
    "Cautious one-sentence ack streamed right after the update-canvas policy screen passes, before the silent classify + find-paths chain.",
  variables: [],
  system: SYSTEM,
  user: USER,
};
