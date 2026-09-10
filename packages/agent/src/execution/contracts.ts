import type { GraphState, WorkflowDefinition } from "@kortyx/core";
import { z } from "zod";
import type { SelectWorkflowFn } from "../orchestrator";
import { ExecutionRequestError } from "./types";

export async function resolveExecutionWorkflow(
  select: SelectWorkflowFn,
  reference: WorkflowDefinition | string,
): Promise<WorkflowDefinition> {
  const id = typeof reference === "string" ? reference : reference.id;
  let workflow: WorkflowDefinition;
  try {
    workflow = await select(id);
  } catch {
    throw new ExecutionRequestError(
      "UNKNOWN_WORKFLOW",
      `Workflow '${id}' is not registered.`,
    );
  }
  if (workflow.id !== id)
    throw new ExecutionRequestError(
      "UNKNOWN_WORKFLOW",
      `Workflow '${id}' is not registered.`,
    );
  if (!workflow.inputSchema || !workflow.outputSchema)
    throw new ExecutionRequestError(
      "MISSING_CONTRACT",
      `Workflow '${id}' requires inputSchema and outputSchema.`,
    );
  if (
    typeof reference !== "string" &&
    (reference.version !== workflow.version ||
      reference.inputSchema !== workflow.inputSchema ||
      reference.outputSchema !== workflow.outputSchema)
  )
    throw new ExecutionRequestError(
      "CONTRACT_MISMATCH",
      "The typed workflow contract does not match the registered definition.",
    );
  return workflow;
}

export function parseExecutionInput(
  workflow: WorkflowDefinition,
  input: unknown,
): unknown {
  try {
    z.json().parse(input);
    const parsed = workflow.inputSchema
      ? workflow.inputSchema.parse(input)
      : input;
    z.json().parse(parsed);
    return parsed;
  } catch (error) {
    throw new ExecutionRequestError(
      "INVALID_INPUT",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** Validate the terminal workflow and entry contract, applying each schema once. */
export async function validateExecutionOutput(
  state: GraphState,
  select: SelectWorkflowFn,
): Promise<GraphState> {
  if (!state.config?.executionContract) return state;
  const terminal = await select(String(state.currentWorkflow));
  const contract = state.config.executionContract as {
    id: string;
    version: string;
  };
  const root = await select(contract.id);
  if (root.id !== contract.id || root.version !== contract.version)
    throw new Error("The root workflow changed since execution started.");
  let data = state.data ?? {};
  try {
    for (const schema of new Set([terminal.outputSchema, root.outputSchema])) {
      if (schema) data = schema.parse(data);
    }
    if (terminal.outputSchema || root.outputSchema) z.json().parse(data);
  } catch (error) {
    const failure = new Error(
      `Workflow output validation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    Object.assign(failure, { code: "INVALID_OUTPUT" });
    throw failure;
  }
  return { ...state, data };
}
