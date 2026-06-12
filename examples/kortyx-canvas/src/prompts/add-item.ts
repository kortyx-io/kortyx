/**
 * Adds ONE new item under an existing section. Caller
 * pre-renders the canvas block; the template just substitutes.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You add ONE new item to an existing section in the product discovery canvas.

{{policyRules}}

### TASK
Return JSON only:
  { sectionKey, itemKey, item: { item_text,
    item_rationale }, label, reason }

Rules:
- \`sectionKey\` is the internal section key and MUST be one of the existing keys (resolve by label,
  snake_case key, or ordinal position).
- \`itemKey\` is snake_case AND unique among that section's existing
  items.
- The item matches the tone and depth of sibling items.
- \`label\` is human-readable for chat confirmation, e.g.
  'A new item under "Core Assumption"'.
- \`reason\` is ONE short sentence justifying the addition. No jargon.
- If the user request is blocked by an ABSOLUTE COMPLIANCE RULE,
  return \`sectionKey: ''\`, \`itemKey: ''\`, an empty
  \`item.item_text\`, and a \`reason\` starting with
  \`RULE_VIOLATION: <CATEGORY> — <explanation>\`.
`;

const USER = `## Current canvas
{{canvasBlock}}

## User request
{{userText}}

Pick the target section and draft the item now.`;

export const ADD_ITEM_PROMPT: PromptTemplate = {
  name: "add-item",
  description: "Generate one new item under an existing section in a canvas.",
  variables: ["canvasBlock", "userText"],
  system: SYSTEM,
  user: USER,
};
