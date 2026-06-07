import type { CanvasMode } from "@/schemas/discovery-canvas";

export type FacilitatorStyleOption = {
  id: string;
  name: string;
  description?: string | null;
};

export type DemoBrief = {
  id: string;
  translations: Array<{
    language: string;
    title: string;
    companyName: string | null;
    description: string | null;
  }>;
};

export type DemoAgent = {
  id: string;
  title: string;
  description: string | null;
  tone: string;
  customInstructions: string | null;
};

export type SavedDiscoveryItem = {
  id: string;
  text: string;
  rationale?: string | null;
  origin: "ai" | "human";
};

export type SavedDiscoverySection = {
  id: string;
  title: string;
  description: string;
  rationale?: string | null;
  origin: "ai" | "human";
  items: SavedDiscoveryItem[];
};

export type SavedDiscoveryCanvas = {
  id: string;
  title: string;
  sections: SavedDiscoverySection[];
  language: string;
  canvasMode?: CanvasMode;
};

const briefs: DemoBrief[] = [
  {
    id: "ai-agent-team-insights",
    translations: [
      {
        language: "en",
        title: "AI Agent Team Insights",
        companyName: "Discovery Lab",
        description:
          "Engineering managers are adopting AI coding agents, but they cannot clearly see where agents speed teams up, where they create review burden, and which workflows need governance. The idea is a product that turns repository, pull request, and team feedback signals into a shared operating view.",
      },
    ],
  },
  {
    id: "support-triage-copilot",
    translations: [
      {
        language: "en",
        title: "Support Triage Copilot",
        companyName: "Discovery Lab",
        description:
          "Customer support teams receive long, messy conversations across chat and email. The idea is a copilot that summarizes customer intent, detects urgency, groups duplicate issues, and drafts the next best response while keeping humans in control.",
      },
    ],
  },
  {
    id: "dev-onboarding-companion",
    translations: [
      {
        language: "en",
        title: "Developer Onboarding Companion",
        companyName: "Discovery Lab",
        description:
          "New engineers struggle to understand large codebases, team norms, and the reasoning behind architecture decisions. The idea is an onboarding companion that turns docs, code paths, and past decisions into guided learning tasks.",
      },
    ],
  },
  {
    id: "meeting-followup-automation",
    translations: [
      {
        language: "en",
        title: "Meeting Follow-up Automation",
        companyName: "Discovery Lab",
        description:
          "Teams leave meetings with scattered notes, unclear owners, and decisions that get lost. The idea is a workspace that extracts decisions, risks, action items, and unresolved questions from meeting notes into a follow-up plan.",
      },
    ],
  },
];

const agents: DemoAgent[] = [
  {
    id: "lean-product-coach",
    title: "Lean Product Coach",
    description: "Assumption-driven, concise, and experiment-oriented.",
    tone: "practical and crisp",
    customInstructions:
      "Prefer clear assumptions, small experiments, and decision-oriented next steps.",
  },
  {
    id: "enterprise-product-strategist",
    title: "Enterprise Product Strategist",
    description: "Structured, stakeholder-aware, and risk-sensitive.",
    tone: "structured and executive-friendly",
    customInstructions:
      "Emphasize buyer/user separation, adoption risks, operational constraints, and measurable outcomes.",
  },
  {
    id: "growth-discovery-facilitator",
    title: "Growth Discovery Facilitator",
    description: "Opportunity-focused, metric-oriented, and energetic.",
    tone: "direct and exploratory",
    customInstructions:
      "Highlight acquisition loops, activation moments, monetization assumptions, and lightweight validation tests.",
  },
];

const facilitatorStyles: FacilitatorStyleOption[] = [
  {
    id: "lean",
    name: "Lean Discovery",
    description: "Compact language focused on assumptions and experiments.",
  },
  {
    id: "enterprise",
    name: "Enterprise Briefing",
    description: "More formal language for stakeholder alignment.",
  },
  {
    id: "workshop",
    name: "Workshop Board",
    description: "Facilitation-friendly language for team discussion.",
  },
];

const savedCanvases = new Map<string, SavedDiscoveryCanvas>();

function matches(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

export async function listBriefs(
  _tenantId: string,
  filters: { search?: string; isArchived?: boolean } = {},
  pagination: { page: number; limit: number } = { page: 1, limit: 20 },
) {
  const query = filters.search?.trim() ?? "";
  const filtered = query
    ? briefs.filter((brief) =>
        brief.translations.some((t) =>
          matches(
            `${t.title} ${t.companyName ?? ""} ${t.description ?? ""}`,
            query,
          ),
        ),
      )
    : briefs;
  return { data: { briefs: filtered.slice(0, pagination.limit) } };
}

export async function getBriefById(_tenantId: string, briefId: string) {
  const data = briefs.find((brief) => brief.id === briefId) ?? null;
  return data ? { data } : { error: "not found", data: null };
}

export async function listAgents(
  _tenantId: string,
  filters: { search?: string; isArchived?: boolean } = {},
  pagination: { page: number; limit: number } = { page: 1, limit: 20 },
) {
  const query = filters.search?.trim() ?? "";
  const filtered = query
    ? agents.filter((agent) =>
        matches(`${agent.title} ${agent.description ?? ""}`, query),
      )
    : agents;
  return { data: { agents: filtered.slice(0, pagination.limit) } };
}

export async function getAgentById(_tenantId: string, agentId: string) {
  const data = agents.find((agent) => agent.id === agentId) ?? null;
  return data ? { data } : { error: "not found", data: null };
}

export async function listFacilitatorStyles(
  _tenantId = "demo",
  _filters: { includeArchived?: boolean } = {},
) {
  return { data: facilitatorStyles };
}

export async function getTenant(_tenantId: string) {
  return {
    data: { id: "demo", displayName: "Discovery Lab" },
    error: null,
  };
}

export function getTenantSettings(tenant: { displayName?: string | null }) {
  return { displayName: tenant.displayName ?? "Discovery Lab" };
}

export function getLocalizedBriefContent(
  translations: DemoBrief["translations"],
  language: string,
) {
  return (
    translations.find((item) => item.language === language) ??
    translations[0] ?? {
      language,
      title: "Untitled",
      companyName: null,
      description: null,
    }
  );
}

export async function saveDiscoveryCanvasSections(
  canvasId: string | undefined,
  sections: SavedDiscoverySection[],
  language: string,
  options: {
    title: string;
    canvasMode?: CanvasMode;
  },
): Promise<{ success: boolean; canvasId?: string; error?: string }> {
  const id = canvasId ?? crypto.randomUUID();
  savedCanvases.set(id, {
    id,
    title: options.title,
    sections,
    language,
    ...(options.canvasMode ? { canvasMode: options.canvasMode } : {}),
  });
  return { success: true, canvasId: id };
}
