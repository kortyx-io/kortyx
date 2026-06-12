/**
 * Lists every section the user wants removed. Caller pre-renders the canvas
 * and existing keys list.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `List EVERY section the user wants removed from the canvas.
Resolve by label, snake_case key, or ordinal position.

Return JSON only: { sections: [{ sectionKey, label, reason }] }
- Return one entry per distinct section to delete.
- \`sectionKey\` MUST be one of the existing keys (no inventing).
- \`label\` is the section title in quotes for chat confirmation.
- \`reason\` is ONE short sentence acknowledging that specific removal.
- If nothing matches, return \`{ sections: [] }\`.
`;

const USER = `## Existing section keys
{{existingKeysBlock}}

## Current canvas
{{canvasBlock}}

## User request
{{userText}}

List all sections to remove.`;

export const REMOVE_SECTION_PROMPT: PromptTemplate = {
  name: "remove-section",
  description: "List every section to remove from a canvas.",
  variables: ["existingKeysBlock", "canvasBlock", "userText"],
  system: SYSTEM,
  user: USER,
};
