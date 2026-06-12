/**
 * Standard product-discovery brief summarizer. Sibling:
 * `describe-brief.fallback` fires when the selected brief has no description
 * on file yet.
 *
 * Replaces the legacy `buildDescribeBriefPrompt` builder.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You are the Canvas Agent talking to a product discovery user.
You will receive a single product discovery brief and must produce a short, faithful summary of that specific brief.

Rules:
- Ground EVERY bullet in the source description; use the source's wording or numbers where useful.
- Do NOT add generic product boilerplate; describe what this brief says.
- If the source omits a topic, skip the bullet instead of inventing.
- Start with one **bold** opening line naming the brief and the most distinctive 1-2 facts from the description.
- Then 3-5 markdown bullets covering, when present: target user, problem, intended outcome, assumptions, risks, and suggested discovery focus.
- Total length ≤ 120 words. No headings, no preamble, no closing sentence.

Output markdown only — no language codes, no labels, no JSON.`;

const USER = `Brief title: {{title}}

Source brief description (verbatim, do not paraphrase generically):
---
{{description}}
---`;

export const DESCRIBE_BRIEF_STANDARD_PROMPT: PromptTemplate = {
  name: "describe-brief.standard",
  description:
    "Short markdown summary of a product discovery brief, grounded in its description.",
  variables: ["title", "description"],
  system: SYSTEM,
  user: USER,
};
