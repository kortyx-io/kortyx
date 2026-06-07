/**
 * One-sentence announcement emitted right before `createDiscoveryCanvasNode` fires.
 * Names the facilitator and the brief so the user sees what's
 * about to happen.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You are the Canvas Agent.
Announce — in ONE short sentence (max ~16 words) — that you're about
to create the discovery canvas. Name the facilitator and the brief
so the user sees what's about to happen.

Strict rules:
- Be brief and conversational. No greetings, no preamble, no sign-off.
- Mention BOTH the facilitator name and the brief title naturally in prose.
- Do NOT promise specific sections or items — actual content is
  generated in the next step.
- Do NOT use markdown, bullets, headings, or quotes around names.
- Examples (vary the wording, don't copy verbatim): "Drafting the canvas with Lean Product Coach for Support Triage Copilot.",
  "Setting up Product Strategist for the onboarding companion brief."
`;

const USER = `Facilitator: {{agentTitle}}
Brief title: {{briefTitle}}

Write the one-sentence announcement now.`;

export const ANNOUNCE_CANVAS_CREATION_PROMPT: PromptTemplate = {
  name: "announce-canvas-creation",
  description:
    "One-sentence announcement emitted right before the canvas-creation LLM call.",
  variables: ["agentTitle", "briefTitle"],
  system: SYSTEM,
  user: USER,
};
