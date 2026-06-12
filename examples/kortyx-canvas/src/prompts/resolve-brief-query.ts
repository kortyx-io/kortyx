/**
 * Classifies a user's chat into a single-brief lookup intent for the
 * brief-query workflow. Previously lived inline in
 * `resolvers/resolve-brief-query.ts`.
 *
 * Caller pre-renders:
 *   - `knownBriefBlock`: `Known brief: id=<id>, label="<label>"` or
 *     `Known brief: none`.
 *   - `historyBlock`: `serializeHistoryForPrompt(history, history.length)`.
 *   - `latestUserMessage`: raw, falls back to `(empty)`.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You classify a user's chat into a product-discovery brief lookup intent.
Pick exactly one:
- "use_known": the user is referring to the previously known brief ("this brief", "it"). Only valid when a known id is provided. Never use for list/catalog questions ("what briefs do you have?").
- "search": the user named or described a specific discovery brief. Provide a short free-text \`query\` to fuzzy-search the DB.
- "unclear": cannot tell, OR the user is asking to list/browse available briefs
  without naming one (e.g. "what briefs do you have?", "show me all briefs").
Query rules (CRITICAL — the DB search matches against brief titles):
- Output only the brief keywords. Drop generic brief nouns the user adds:
  "support triage brief" -> "support triage"
  "the onboarding companion idea" -> "onboarding companion"
  Strip these words anywhere they appear: \`brief\`, \`briefs\`, \`idea\`, \`ideas\`, \`product\`, \`canvas\`, plus filler verbs/articles (\`the\`, \`our\`, \`a\`, \`find me\`, \`look up\`, \`tell me about\`, \`show me\`, \`we have\`).
- Prefer the bare title users would see in the brief list.
- Never invent specifics not present in the message/history.
When in doubt, prefer \`unclear\` over guessing a query.
Return JSON only.

{{knownBriefBlock}}`;

const USER = `Recent conversation (oldest → newest):
{{historyBlock}}

Latest user message: {{latestUserMessage}}`;

export const RESOLVE_BRIEF_QUERY_PROMPT: PromptTemplate = {
  name: "resolve-brief-query",
  description:
    "Classify a user's chat into a single-brief lookup intent for the brief-query workflow.",
  variables: ["knownBriefBlock", "historyBlock", "latestUserMessage"],
  system: SYSTEM,
  user: USER,
};
