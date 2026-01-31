import type { WorkflowDefinition } from "@kortyx/core";

type AnyWorkflow = WorkflowDefinition;

export interface WorkflowRegistry {
  list: () => Promise<AnyWorkflow[]>;
  get: (id: string) => Promise<AnyWorkflow | null>;
  select: (
    id: string,
    options?: { fallbackId?: string },
  ) => Promise<AnyWorkflow>;
  refresh?: () => Promise<void>;
}
