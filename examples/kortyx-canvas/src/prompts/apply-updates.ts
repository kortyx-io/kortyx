/**
 * Rewrites individual fields of a Product Discovery Canvas based on update
 * targets resolved upstream by `find-update-paths`. Caller pre-renders
 * the updates list as `{{updatesBlock}}` and the facilitator style list.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You rewrite individual fields of a Product Discovery Canvas.
For each update target, return the replacement \`value\` (a string) and
a short \`reason\` justifying the rewrite.

{{policyRules}}

### TASK

Rules:
- Each update block includes a \`patchKey\`. Use that exact string as the
  key in the output \`patches\` object.
- Copy \`path\` and \`label\` verbatim from the input to the corresponding
  output entry.
- Keep the same tone, register and rough length as the current value,
  unless the instruction explicitly asks otherwise.
- If the path is \`title\`, \`value\` is a short (≤ 8 words) canvas name.
- If the path is \`canvas_mode\`, \`value\` MUST be exactly one of:
  'DISCOVERY_WORKSHOP' or 'EXECUTIVE_BRIEF'.
- If the path is \`facilitator_style_id\`, \`value\` MUST be exactly one of the ids
  listed under <available_facilitatorStyles> below, or the literal string 'null'
  when the user asks to clear the selection. Never invent ids.
- \`reason\` is ONE short sentence (≤ 25 words) explaining what changed
  and why the rewrite is better — written for the user, not for
  yourself. No path/key names, no jargon, no markdown.
- Do NOT add commentary, quotes around the value, or markdown inside
  \`value\`.
- Output JSON only, with shape
  \`{ patches: { "<patchKey>": { path, value, label, reason } } }\`.
- If a rewrite would breach an ABSOLUTE COMPLIANCE RULE, emit \`patches: {}\`
  AND a top-level \`reason\` starting with
  \`RULE_VIOLATION: <CATEGORY> — <explanation>\`. Do NOT rewrite
  the request into an adjacent topic.

<available_facilitatorStyles>
{{availableFacilitatorStyles}}
</available_facilitatorStyles>
`;

const USER = `{{updatesBlock}}`;

export const APPLY_UPDATES_PROMPT: PromptTemplate = {
  name: "apply-updates",
  description:
    "Rewrite resolved canvas fields in one JSON-mode call, respecting the policy.",
  variables: ["availableFacilitatorStyles", "updatesBlock"],
  system: SYSTEM,
  user: USER,
};
