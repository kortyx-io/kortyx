/**
 * Classifies a user's recent chat into brief + facilitator-agent resolution
 * intents for canvas creation. Previously lived inline in
 * `resolvers/resolve-brief-agent.ts`; lifted into the prompts folder so it
 * follows the same loader convention as every other LLM prompt in the
 * feature.
 *
 * Caller pre-renders:
 *   - `knownBriefBlock`: either `Known brief: id=<id>, label="<label>"` or
 *     `Known brief: none`.
 *   - `knownAgentBlock`: same shape for the agent.
 *   - `historyBlock`: full chat history rendered via
 *     `serializeHistoryForPrompt(history, history.length)` (no cap — the
 *     resolver needs the full thread to chase demonstratives).
 *   - `latestUserMessage`: raw user message, falls back to `(empty)`.
 */

import type { PromptTemplate } from "./_loader";

const SYSTEM = `You classify a user's recent chat history to decide what \`brief\` and \`agent\` should be used for the Product Discovery Canvas we're about to generate.
Here, \`brief\` means the selected discovery brief/product idea, and \`agent\` means the facilitator persona.
Pick exactly one intent per entity (brief, agent):
- "use_known": user is continuing with the entity that was already resolved (regenerate, refine, same as before, etc.). Only valid when a known id is provided for that entity AND the most recent conversation centres on that same entity.
- "search": user named or clearly referred to a specific entity. This covers BOTH explicit names ("support triage copilot", "lean product coach") AND demonstratives that refer back to a recently-described entity in the same chat ("create a canvas with this", "use that brief", "build it for the one we just discussed"). Provide a short \`query\` string we can fuzzy-search the DB with; for demonstratives use the most recently-described title from the assistant's prior turns.
- "pick_new": user explicitly wants a different entity ("a new brief", "another idea", "different agent") without naming it.
- "unclear": cannot tell from context.
Demonstrative rule: when the user says \`this\`, \`that\`, \`it\`, \`the brief\`, \`the idea\`, \`with this\`, etc. AND a specific brief/agent has been described in a recent assistant turn, classify as \`search\` with that entity's title, even if it does not match \`Known brief\` / \`Known agent\`. The user is referring to what is on screen, not the stale cached value.
If the user mentions a specific brief/agent that does NOT match the known one, choose \`search\`, not \`use_known\`.
If the user says "for <name> with <agent>", classify <name> as the brief/product idea and <agent> as the agent. For example, "generate me a canvas for Product Discovery Canvas with Lean Product Coach" means brief search query "Product Discovery Canvas" and agent search query "Lean Product Coach".
Use \`unclear\` whenever in doubt; never invent a search query.
Return JSON only matching the requested schema.

{{knownBriefBlock}}
{{knownAgentBlock}}`;

const USER = `Recent conversation (oldest → newest):
{{historyBlock}}

Latest user message: {{latestUserMessage}}

Classify intent for the internal \`brief\` field and \`agent\`.`;

export const RESOLVE_BRIEF_AGENT_PROMPT: PromptTemplate = {
  name: "resolve-brief-agent",
  description:
    "Classify recent chat into brief + facilitator-agent resolution intents for canvas creation.",
  variables: [
    "knownBriefBlock",
    "knownAgentBlock",
    "historyBlock",
    "latestUserMessage",
  ],
  system: SYSTEM,
  user: USER,
};
