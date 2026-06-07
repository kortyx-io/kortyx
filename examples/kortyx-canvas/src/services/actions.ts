"use server";

import {
  getLocalizedBriefContent,
  listAgents,
  listBriefs,
} from "@/services/demo-data";

export type BriefPickerOption = {
  id: string;
  title: string;
  companyName: string | null;
};

export type AgentPickerOption = {
  id: string;
  title: string;
  description: string | null;
};

/**
 * Search the demo brief catalog for the canvas brief picker. Function names
 * keep the original protocol shape while this example presents the records
 * as product discovery briefs.
 */
export async function searchBriefsForDiscoveryCanvas(
  query: string,
): Promise<BriefPickerOption[]> {
  const filters: { search?: string; isArchived?: boolean } = {
    isArchived: false,
  };
  if (query) filters.search = query;

  const { data } = await listBriefs("demo", filters, { page: 1, limit: 20 });

  if (!data?.briefs) return [];

  return data.briefs.map((brief) => {
    const localized = getLocalizedBriefContent(brief.translations, "en");
    return {
      id: brief.id,
      title: localized.title,
      companyName: localized.companyName,
    };
  });
}

/**
 * Search the tenant's active agents for the canvas-agent picker.
 * Agents are typically <100 per tenant, so we load up to 100 per search
 * call instead of true pagination.
 */
export async function searchAgentsForDiscoveryCanvas(
  query: string,
): Promise<AgentPickerOption[]> {
  const filters: { search?: string; isArchived?: boolean } = {
    isArchived: false,
  };
  if (query) filters.search = query;

  const { data } = await listAgents("demo", filters, { page: 1, limit: 100 });

  if (!data?.agents) return [];

  return data.agents.map((agent) => ({
    id: agent.id,
    title: agent.title,
    description: agent.description,
  }));
}
