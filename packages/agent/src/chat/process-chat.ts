import type { MemoryEnvelope } from "@kortyx/core";
import type { MemoryAdapter } from "@kortyx/memory";
import type { GetProviderFn } from "@kortyx/providers";
import type { FrameworkAdapter, WorkflowRegistry } from "@kortyx/runtime";
import {
  buildInitialGraphState,
  createLangGraph,
  makeRequestId,
} from "@kortyx/runtime";
import { createStreamResponse, type StreamChunk } from "@kortyx/stream";
import type { ApplyResumeSelection } from "../interrupt/resume-handler";
import {
  parseResumeMeta,
  tryPrepareResumeStream,
} from "../interrupt/resume-handler";
import type { SelectWorkflowFn } from "../orchestrator";
import { orchestrateGraphStream } from "../orchestrator";
import type { ChatMessage } from "../types/chat-message";
import { extractLatestUserMessage } from "../utils/extract-latest-message";

type InitializeProvidersFn<Config> = (
  aiConfig: Config extends { ai: infer A } ? A : unknown,
) => void;

export interface ProcessChatArgs<
  Config extends Record<string, unknown>,
  Options,
> {
  messages: ChatMessage[];
  options?: Options | undefined;
  sessionId?: string;
  defaultWorkflowId?: string;
  loadRuntimeConfig: (options?: Options) => Config | Promise<Config>;
  selectWorkflow?: SelectWorkflowFn;
  workflowRegistry?: WorkflowRegistry;
  frameworkAdapter?: FrameworkAdapter;
  getProvider: GetProviderFn;
  initializeProviders?: InitializeProvidersFn<Config>;
  memoryAdapter?: MemoryAdapter;
  applyResumeSelection?: ApplyResumeSelection;
}

export async function processChat<
  Config extends Record<string, unknown>,
  Options = unknown,
>({
  messages,
  options,
  sessionId,
  defaultWorkflowId,
  loadRuntimeConfig,
  selectWorkflow,
  workflowRegistry,
  frameworkAdapter,
  getProvider,
  initializeProviders,
  memoryAdapter,
  applyResumeSelection,
}: ProcessChatArgs<Config, Options>): Promise<Response> {
  // Load runtime configuration (API keys, environment, etc.)
  const config = await loadRuntimeConfig(options);
  if (initializeProviders) {
    initializeProviders((config as any)?.ai);
  }
  const runtimeConfig = {
    ...config,
    getProvider,
    ...(memoryAdapter ? { memoryAdapter } : {}),
    ...(frameworkAdapter
      ? { checkpointer: frameworkAdapter.checkpointer }
      : {}),
  } as Record<string, unknown>;

  const workflowSelector: SelectWorkflowFn | null =
    selectWorkflow ??
    (workflowRegistry ? (id) => workflowRegistry.select(id) : null);
  if (!workflowSelector) {
    throw new Error(
      "processChat requires selectWorkflow or workflowRegistry to resolve workflows.",
    );
  }

  // Extract session + input
  const fallbackSessionId = (options as { sessionId?: string } | undefined)
    ?.sessionId;
  const resolvedSessionId =
    sessionId || fallbackSessionId || "anonymous-session";
  const last = messages[messages.length - 1];
  const input = extractLatestUserMessage(messages);

  // Business memory is opt-in via useAiMemory(); agent does not auto-persist state
  const previousMessages = messages.slice(0, -1);
  const memory: MemoryEnvelope = {
    ...(previousMessages.length > 0
      ? { conversationMessages: previousMessages }
      : {}),
  } as MemoryEnvelope;

  // Allow callers to override the entry workflow for this request.
  // This is intentionally option-based (so adapters like Next.js can pass it),
  // and it is ignored for resume requests (resume must follow the pending workflow).
  const isResumeRequest = Boolean(parseResumeMeta(last));
  const requestedWorkflowId =
    (options as any)?.workflowId ?? (options as any)?.workflow;
  if (!isResumeRequest && typeof requestedWorkflowId === "string") {
    // Treat empty string as "use default workflow" and clear stored selection.
    if (requestedWorkflowId.trim() === "")
      delete (memory as any).currentWorkflow;
    else memory.currentWorkflow = requestedWorkflowId as any;
  }

  // Base state (LLM input, messages, memory)
  const baseState = await buildInitialGraphState({
    input,
    config: runtimeConfig,
    memory,
    ...(defaultWorkflowId ? { defaultWorkflowId } : {}),
  });

  // If this is a resume request, continue from pending snapshot and skip workflow determination
  const resumeStream = await tryPrepareResumeStream({
    lastMessage: last,
    sessionId: resolvedSessionId,
    config: runtimeConfig,
    selectWorkflow: workflowSelector,
    ...(frameworkAdapter ? { frameworkAdapter } : {}),
    ...(defaultWorkflowId ? { defaultWorkflowId } : {}),
    ...(applyResumeSelection ? { applyResumeSelection } : {}),
  });
  if (resumeStream) return createStreamResponse(resumeStream);

  const runId = makeRequestId("run");

  // Determine which workflow to run (defaults to frontdesk)
  const currentWorkflow = baseState.currentWorkflow;
  const selectedWorkflow = await workflowSelector(currentWorkflow as string);

  const graph = await createLangGraph(selectedWorkflow, runtimeConfig as any);

  const orchestratedStream = await orchestrateGraphStream({
    sessionId: resolvedSessionId,
    runId,
    graph,
    state: { ...baseState, currentWorkflow },
    config: runtimeConfig,
    selectWorkflow: workflowSelector,
    ...(frameworkAdapter ? { frameworkAdapter } : {}),
  });

  return createStreamResponse(orchestratedStream as AsyncIterable<StreamChunk>);
}
