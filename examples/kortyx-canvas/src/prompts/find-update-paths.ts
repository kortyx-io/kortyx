/**
 * Translates a user's update request into concrete edit targets
 * on screen. Caller pre-renders the canvas block and recent history.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You translate a user's update request into concrete edit targets
on a Product Discovery Canvas that is shown on a canvas.

You will receive:
  1. The current canvas, with each editable field listed as \`path :: value\`.
  2. Recent conversation history (oldest → newest), so you can resolve
     references that span multiple turns.
  3. The user's latest request.

Return one entry per atomic edit. A single request may produce many
entries (e.g. 'update section 2 item 1 and the intro' → 2 entries).

Allowed paths (USE EXACTLY THESE — do not invent new ones):
  title
  facilitator_style_id
  canvas_mode
  intro.label
  intro.summary
  intro.item_text
  sections.<section_key>.section_label
  sections.<section_key>.section_summary
  sections.<section_key>.section_rationale
  sections.<section_key>.items.<item_key>.item_text
  sections.<section_key>.items.<item_key>.item_rationale

Rules:
- Use the conversation history to resolve targets when the latest
  message alone is ambiguous. E.g. if the user earlier said "the
  Core Assumption section title" and now says "make it more precise",
  target that section's \`section_label\`.
- Match canvas entries by their labels, by snake_case keys, OR by ordinal
  position ('section 2', 'item 1') against the order shown below.
  Use the exact <section_key> / <item_key> from the listing. Here,
  <section_key> is the internal section key. Do NOT make up new keys.
- If the user mentions a section title but doesn't say which field,
  default to \`section_label\` (they likely mean the title itself).
- When the user says "product brief" title / card title with no other
  field hint, the target is \`intro.label\`.
- When the user says "product brief" description / explanation with no
  other field hint, the target is \`intro.summary\`.
- When the user says "introduction" / "intro" / "introductory item"
  with no other field hint, the target is \`intro.item_text\`.
- \`instruction\` paraphrases the user's intent for that single field,
  combining the latest message and any clarifying context from history.
- \`label\` is a short, human-friendly target name for chat confirmation
  (e.g. 'Item 1 of "Core Assumption"' or 'Intake item').
- Act whenever the user names a target (intro, a section, an item)
  AND any actionable intent can be inferred — even if the verb is
  vague ("sanitize", "clean up", "fix", "polish", "shorten", "tighten",
  "rewrite"). Use the prior assistant turn to fill in the why: e.g. if
  the assistant just flagged religion in the intro and the user says
  "sanitize introduction", target \`intro.item_text\` with an
  instruction to remove the religion content.
- Only return an empty \`updates\` array when NO field can be identified
  at all — typically when the user gives a pure style cue with no
  target named or implied anywhere in recent history.
`;

const USER = `## Current canvas
{{canvasBlock}}

## Recent conversation
{{historyBlock}}

## User's latest request
{{userText}}`;

export const FIND_UPDATE_PATHS_PROMPT: PromptTemplate = {
  name: "find-update-paths",
  description:
    "Translate a user's update request into atomic field-level edit targets on screen.",
  variables: ["canvasBlock", "historyBlock", "userText"],
  system: SYSTEM,
  user: USER,
};
