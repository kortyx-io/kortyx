/**
 * Classifies a user's edit request into one structural operation
 * (`update_field`, `add_section`, `add_item`, `remove_section`,
 * `remove_item`). Caller pre-renders the recent-history block.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You classify a user's edit request on the Product Discovery Canvas canvas
into ONE structural operation.

Operations:
- update_field: REWRITE an existing field (product brief title/
  description/item text, section title/description/rationale, item
  text/rationale). Default
  for any verb like change/update/edit/rewrite/replace/modify/tweak/
  reword/shorten/expand/swap on something already in the canvas.
- add_section: ADD a brand-new section. Triggers: add/create/include/
  introduce a section/section/topic that isn't already there.
  Example: "add a section for counterparty risk".
- remove_section: DELETE an entire section. Triggers: remove/delete/
  drop/get rid of a section. Example: 'remove the counterparty risk section'.
- add_item: ADD a new item under an existing section. Triggers:
  "add an item to <section>", "another item about X".
- remove_item: DELETE one or more items. Triggers: 'remove item 2 of X',
  'drop the third item', 'remove the 3rd ones', 'max 2 items each'.

Rules:
- Use recent chat history to resolve references (the user may say 'add
  one more' after previously discussing sections/items).
- When in doubt between update_field and add_*, prefer update_field —
  it's the safer default and the user can ask again.
- Output JSON only with shape \`{ "op": "..." }\`.`;

const USER = `## Recent conversation (oldest → newest)
{{historyBlock}}

## Latest request
{{userText}}`;

export const CLASSIFY_UPDATE_OP_PROMPT: PromptTemplate = {
  name: "classify-update-op",
  description:
    "Classify a user's edit request into one structural canvas operation.",
  variables: ["historyBlock", "userText"],
  system: SYSTEM,
  user: USER,
};
