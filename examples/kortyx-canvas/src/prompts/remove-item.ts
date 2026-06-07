/**
 * Lists every item the user wants removed. Caller pre-renders the canvas block.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `List EVERY item the user wants removed.

Return JSON only: { items: [{ sectionKey, itemKey, label, reason }] }
- Return one entry per distinct item to delete.
- For bulk rules like "remove the 3rd item in each section" or "max 2 items each,
  drop the extras", emit one entry per matching item across all sections.
- Both keys MUST be existing ones from the canvas (no inventing).
- Resolve by label, snake_case key, or ordinal position
  ('item 2 of "Core Assumption"').
- \`label\` is human-readable, e.g. 'Item 2 of "Core Assumption"'.
- \`reason\` is ONE short sentence acknowledging that specific removal.
- If nothing matches, return \`{ items: [] }\`.
`;

const USER = `## Current canvas
{{canvasBlock}}

## User request
{{userText}}

List all items to remove.`;

export const REMOVE_ITEM_PROMPT: PromptTemplate = {
  name: "remove-item",
  description: "List every item to remove from a Product Discovery Canvas.",
  variables: ["canvasBlock", "userText"],
  system: SYSTEM,
  user: USER,
};
