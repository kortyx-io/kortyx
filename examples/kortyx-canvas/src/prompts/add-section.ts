/**
 * Drafts ONE new section to add to an existing canvas. Used
 * by `addSectionNode` after the update classifier has tagged the
 * user's request as `add_section`.
 *
 * Caller supplies pre-rendered text for the existing canvas and
 * existing section keys — the template only does substitution.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You draft ONE new section to add to an existing product discovery canvas.

{{policyRules}}

### TASK
Return JSON only, shape:
  { sectionKey, section: { section_label, section_summary,
    section_rationale, items: { <key>: { item_text,
    item_rationale } } }, label, reason }

Rules:
- \`sectionKey\` is snake_case (e.g. \`communication_skills\`) and MUST
  NOT collide with any existing key.
- 1-3 items; each item key is snake_case and unique within
  this new section.
- Match the tone, register and language of the existing sections.
- \`sectionKey\` is the internal key for the new section.
- \`label\` is the section title in quotes, e.g. '"Core Assumption"'.
- \`reason\` is ONE short sentence justifying why this section belongs
  in the canvas. No jargon, no paths/keys, no markdown.
- Do NOT duplicate any section already in the canvas.
- If the user request is blocked by an ABSOLUTE COMPLIANCE RULE,
  return \`sectionKey: ''\`, an empty \`section.items\` object, and
  a \`reason\` starting with \`RULE_VIOLATION: <CATEGORY> — <explanation>\`.
`;

const USER = `## Existing section keys (do not reuse)
{{existingKeysBlock}}

## Existing canvas for tone + dedupe reference
{{canvasBlock}}

## User request
{{userText}}

Draft the new section now.`;

export const ADD_SECTION_PROMPT: PromptTemplate = {
  name: "add-section",
  description:
    "Generate one new section with 1-3 items to add to an existing canvas.",
  variables: ["existingKeysBlock", "canvasBlock", "userText"],
  system: SYSTEM,
  user: USER,
};
