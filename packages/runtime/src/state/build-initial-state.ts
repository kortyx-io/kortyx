import type { GraphState, MemoryEnvelope } from "@kortyx/core";

/**
 * Prepares the initial runtime graph state from chat context, memory, and runtime config.
 * This stays deliberately generic in the config type so apps can shape it.
 */
export interface InitialStateArgs<Config = unknown> {
  input: unknown;
  memory: MemoryEnvelope;
  config: Config;
  defaultWorkflowId?: string;
}

export async function buildInitialGraphState<Config>({
  input,
  memory,
  config,
  defaultWorkflowId,
}: InitialStateArgs<Config>): Promise<GraphState> {
  const currentWorkflow =
    (memory.currentWorkflow as any) || (defaultWorkflowId as any);
  if (!currentWorkflow) {
    throw new Error(
      "No workflow selected. Provide defaultWorkflowId (or set memory.currentWorkflow) before starting the graph.",
    );
  }

  return {
    input,
    lastNode: "__start__",
    memory,
    config: config as unknown,
    conversationHistory: [],
    currentWorkflow,
    awaitingHumanInput: false,
  } as GraphState;
}
