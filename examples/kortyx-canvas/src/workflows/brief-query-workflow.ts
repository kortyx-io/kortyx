import "server-only";

import { defineWorkflow } from "kortyx";
import { WORKFLOW_IDS } from "@/lib/protocol";
import { describeBriefNode } from "../nodes/brief-query/describe-brief-node";
import { findBriefNode } from "../nodes/brief-query/find-brief-node";

/**
 * Two-step "find a product discovery brief, then tell me about it" workflow.
 *
 *   1. `findBrief`     — LLM extracts a target from chat history and the
 *                       latest message, then resolves it to a concrete
 *                       brief id (auto when 1 hit, picker shortlist when >1,
 *                       generic picker on ambiguity).
 *   2. `describeBrief` — fetches the brief and streams a short markdown
 *                       summary into chat. After this turn the brief
 *                       description lives in chat history, so general-chat
 *                       can answer follow-ups ("what is unusual?",
 *                       "what evidence is missing?") without another
 *                       DB call.
 *
 * Errors thrown by any node are caught via `onError: emit-and-stop` and
 * streamed back to the client as a clean error chunk.
 */
export const briefQueryWorkflow = defineWorkflow({
  id: WORKFLOW_IDS.briefQuery,
  version: "1.0.0",
  description:
    "Resolve which product discovery brief the user is asking about and stream a short description back.",
  nodes: {
    findBrief: {
      run: findBriefNode,
      behavior: { onError: { mode: "emit-and-stop" } },
    },
    describeBrief: {
      run: describeBriefNode,
      params: { temperature: 0.3 },
      behavior: { onError: { mode: "emit-and-stop" } },
    },
  },
  edges: [
    ["__start__", "findBrief"],
    ["findBrief", "describeBrief"],
    ["describeBrief", "__end__"],
  ],
});
