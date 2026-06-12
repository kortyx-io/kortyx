/**
 * Fallback sentence when the selected brief has no description on file
 * yet. Sibling: `describe-brief.standard` covers the normal path.
 *
 * The system text is space-joined (not newline-joined) in the legacy —
 * mirrored here as a single-line template to preserve byte parity.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `Write ONE friendly sentence telling the user that the selected brief has no description on file yet, naming the brief title. Output plain text only — no language codes, no labels.`;

const USER = `Brief title: {{title}}`;

export const DESCRIBE_BRIEF_FALLBACK_PROMPT: PromptTemplate = {
  name: "describe-brief.fallback",
  description:
    "Friendly one-sentence apology when the selected brief has no description on file.",
  variables: ["title"],
  system: SYSTEM,
  user: USER,
};
