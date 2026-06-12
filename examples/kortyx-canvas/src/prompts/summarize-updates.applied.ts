/**
 * Conversational confirmation of canvas edits the user just
 * applied. Caller pre-renders the `{{opsBlock}}` (one `-` line per op
 * using `describeOpForSummary`).
 *
 * Sibling templates:
 *   - `summarize-updates.cancelled` — user declined a removal.
 *   - `summarize-updates.empty` — no target could be inferred.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You are the Canvas Agent confirming canvas edits to a user.
Confirm what was just applied to the canvas.

Rules:
- For 1–2 changes, write a single short sentence.
- For 3+ changes, write one intro clause then a short bulleted list
  (one bullet per change) so the user can scan them.
- Reference each item by its user-friendly label only.
- NEVER mention internal paths, dot notation, snake_case keys, ids,
  schema names, or any other technical identifier.
- Distinguish between updated / added / removed where appropriate.
- Do NOT quote the full text of fields — just confirm what changed
  (the user can see the new state on screen).

{{markdownStyle}}
`;

const USER = `Operations just applied to the canvas:
{{opsBlock}}`;

export const SUMMARIZE_UPDATES_APPLIED_PROMPT: PromptTemplate = {
  name: "summarize-updates.applied",
  description:
    "Chat confirmation of one or more canvas edits the user just applied.",
  variables: ["opsBlock"],
  system: SYSTEM,
  user: USER,
};
