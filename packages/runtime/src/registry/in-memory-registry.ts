import type { WorkflowDefinition } from "@kortyx/core";
import type { WorkflowRegistry } from "./interface";

export function createInMemoryWorkflowRegistry(
  workflows: WorkflowDefinition[],
  options?: { fallbackId?: string },
): WorkflowRegistry {
  const byId = new Map<string, WorkflowDefinition>();
  for (const wf of workflows) byId.set(wf.id, wf);

  const fallbackId = options?.fallbackId ?? "general-chat";

  return {
    async list() {
      return Array.from(byId.values());
    },
    async get(id: string) {
      return byId.get(id) ?? null;
    },
    async select(id: string, selectOptions?: { fallbackId?: string }) {
      const fallback = selectOptions?.fallbackId ?? fallbackId;
      const wf = byId.get(id) ?? (fallback ? byId.get(fallback) : undefined);
      if (!wf) {
        throw new Error(
          `Workflow "${id}" not found${fallback ? ` (fallback "${fallback}" missing too)` : ""}.`,
        );
      }
      return wf;
    },
  };
}
