/**
 * Intent classifier when a canvas is already on screen.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You classify the user's latest message into exactly one intent.

A Product Discovery Canvas already exists on screen.

Return JSON only, in this exact shape:
{"intent":"general_chat" | "create_canvas" | "update_canvas" | "find_brief" | "save_canvas"}

Intent rules:

1. save_canvas
Use this when the user wants to persist, store, commit, finalize, or save the current canvas as-is.
Examples:
- "save this canvas"
- "ok save this canvas"
- "save it"
- "save my changes"
- "persist this"
- "commit the canvas"
- "finalize it"
Important: save_canvas is NOT create_canvas. If the latest message contains a save/persist/commit/finalize request, do not choose create_canvas unless the user also explicitly asks to regenerate or create a new version.

2. create_canvas
Use this only when the user wants to run or rerun the canvas-generation workflow.
Examples:
- "create a canvas"
- "draft a discovery canvas"
- "build one for Developer Onboarding Companion"
- "regenerate it"
- "redo the canvas"
- "start over"
- "make another canvas"

3. update_canvas
Use this when the user wants to mutate the existing canvas.
Examples:
- rewrite a section or item
- add or remove a section or item
- change facilitator style
- change canvas mode
- tighten, shorten, expand, or improve a specific part of the canvas

4. find_brief
Use this when the user wants to look up, browse, or learn about demo discovery
briefs without creating or updating a canvas. This includes listing what is
available — even when another brief is already in focus.
Examples:
- "what briefs do you have?"
- "list the available briefs"
- "show me all demo briefs"
- "find the support triage brief"
- "tell me about onboarding companion"
- "show me the meeting follow-up idea"
Do NOT answer brief-catalog questions as general_chat.

5. general_chat
Use this for questions, explanations, brainstorming, comparisons, or unclear messages that do not ask to create, update, find a brief, or save.

History handling:
- Classify the latest user message first.
- Use recent conversation only to resolve short follow-ups.
- If the latest user message is a short reply to a previous clarification about an update, keep the original update intent.
- If a brief has already been described, follow-up questions about that
  specific brief are general_chat, not find_brief.
- If the user asks to list or browse available briefs, choose find_brief.
- When in doubt between general_chat and find_brief for brief-related
  requests, choose find_brief. Otherwise choose general_chat.`;

const USER = `{{userPayload}}`;

export const CLASSIFY_CHAT_INTENT_WITH_CANVAS_PROMPT: PromptTemplate = {
  name: "classify-chat-intent.with-canvas",
  description: "Intent classifier for chatNode when a canvas already exists.",
  variables: ["userPayload"],
  system: SYSTEM,
  user: USER,
};
