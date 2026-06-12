/**
 * Intent classifier when there's no canvas on screen. Used by `chatNode`.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You classify the user's latest message into exactly one intent.

No Product Discovery Canvas exists on screen yet.

Return JSON only, in this exact shape:
{"intent":"general_chat" | "create_canvas" | "update_canvas" | "find_brief" | "save_canvas"}

Intent rules:

1. create_canvas
Use this when the user wants to run the canvas-generation workflow.
Examples:
- "create a canvas"
- "draft a discovery canvas"
- "build one for Developer Onboarding Companion"
- "set up a canvas"
- "make another canvas"

2. find_brief
Use this when the user wants to look up, browse, or learn about demo discovery
briefs without creating a canvas. This includes listing what is available —
even when another brief is already in focus.
Examples:
- "what briefs do you have?"
- "list the available briefs"
- "show me all demo briefs"
- "find the support triage brief"
- "tell me about onboarding companion"
- "show me the meeting follow-up idea"
Do NOT answer brief-catalog questions as general_chat.

3. save_canvas
Only use this if the user explicitly asks to save, persist, commit, or finalize a canvas. Because no canvas exists, the app may later explain that there is nothing to save, but the intent is still save_canvas.
Examples:
- "save this canvas"
- "save it"
- "commit the canvas"

4. update_canvas
Only use this if the user clearly asks to mutate an existing canvas. Because no canvas exists, the app may later explain that there is nothing to update, but the intent is still update_canvas.

5. general_chat
Use this for questions, explanations, brainstorming, comparisons, or unclear messages that do not ask to create, update, find a brief, or save.

History handling:
- Classify the latest user message first.
- Use recent conversation only to resolve short follow-ups.
- If a brief has already been described, follow-up questions about that
  specific brief are general_chat, not find_brief.
- If the user asks to list or browse available briefs, choose find_brief.
- When in doubt between general_chat and find_brief for brief-related
  requests, choose find_brief. Otherwise choose general_chat.`;

const USER = `{{userPayload}}`;

export const CLASSIFY_CHAT_INTENT_NO_CANVAS_PROMPT: PromptTemplate = {
  name: "classify-chat-intent.no-canvas",
  description: "Intent classifier for chatNode when no canvas exists yet.",
  variables: ["userPayload"],
  system: SYSTEM,
  user: USER,
};
