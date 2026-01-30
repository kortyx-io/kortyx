import { WorkflowDefinitionSchema } from "./schema";
import type { WorkflowDefinition } from "./types";

export function defineWorkflow<T extends WorkflowDefinition>(workflow: T): T {
  return WorkflowDefinitionSchema.parse(workflow) as T;
}
