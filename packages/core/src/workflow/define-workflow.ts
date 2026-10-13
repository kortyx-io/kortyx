import type { z } from "zod";
import { WorkflowDefinitionSchema } from "./schema";
import type { WorkflowDataReducers, WorkflowDefinition } from "./types";

export function defineWorkflow<
  OutputSchema extends z.ZodType<Record<string, unknown>>,
  InputSchema extends z.ZodType | undefined = undefined,
>(
  workflow: Omit<
    WorkflowDefinition,
    "outputSchema" | "inputSchema" | "reduce"
  > & {
    inputSchema?: InputSchema;
    outputSchema: OutputSchema;
    reduce: WorkflowDataReducers<z.output<NoInfer<OutputSchema>>>;
  },
): Omit<WorkflowDefinition, "outputSchema" | "inputSchema" | "reduce"> & {
  outputSchema: OutputSchema;
  reduce: WorkflowDataReducers<z.output<OutputSchema>>;
} & (InputSchema extends z.ZodType ? { inputSchema: InputSchema } : {});
export function defineWorkflow<T extends WorkflowDefinition>(
  workflow: T & (WorkflowDefinition extends T ? unknown : { reduce?: never }),
): T;
export function defineWorkflow(
  workflow: WorkflowDefinition,
): WorkflowDefinition {
  return WorkflowDefinitionSchema.parse(workflow) as WorkflowDefinition;
}
