import "server-only";

import {
  getLocalizedBriefContent,
  listAgents,
  listBriefs,
} from "@/services/demo-data";

/**
 * Single match returned by the entity-search helpers below. Both briefs and
 * agents share the same `{ id, label }` shape so picker UI and resolver
 * code can treat them uniformly.
 */
export type EntityCandidate = {
  id: string;
  label: string;
};

const DEFAULT_LIMIT = 5;
const DEFAULT_LANGUAGE = "en";

/**
 * Fuzzy-search the demo tenant's active briefs by free-text query.
 */
export async function searchBriefCandidates(args: {
  tenantId: string;
  query: string;
  limit?: number;
}): Promise<EntityCandidate[]> {
  const { data } = await listBriefs(
    args.tenantId,
    { search: args.query, isArchived: false },
    { page: 1, limit: args.limit ?? DEFAULT_LIMIT },
  );
  if (!data?.briefs) return [];
  return data.briefs.map((brief) => {
    const localized = getLocalizedBriefContent(
      brief.translations,
      DEFAULT_LANGUAGE,
    );
    return { id: brief.id, label: localized.title };
  });
}

/**
 * Fuzzy-search the demo tenant's active agents by free-text query.
 */
export async function searchAgentCandidates(args: {
  tenantId: string;
  query: string;
  limit?: number;
}): Promise<EntityCandidate[]> {
  const { data } = await listAgents(
    args.tenantId,
    { search: args.query, isArchived: false },
    { page: 1, limit: args.limit ?? DEFAULT_LIMIT },
  );
  if (!data?.agents) return [];
  return data.agents.map((agent) => ({ id: agent.id, label: agent.title }));
}
