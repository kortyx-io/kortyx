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

export interface RuntimeConfig {
  session?: { id?: string };
  [key: string]: unknown;
}

export interface ProcessChatArgs<Options> {
  messages: ChatMessage[];
  options?: Options | undefined;
  sessionId?: string;
  defaultWorkflowId?: string;
  loadRuntimeConfig: (
    options?: Options,
  ) => RuntimeConfig | Promise<RuntimeConfig>;
  selectWorkflow?: SelectWorkflowFn;
  workflowRegistry?: WorkflowRegistry;
  frameworkAdapter?: FrameworkAdapter;
  getProvider: GetProviderFn;
  memoryAdapter?: MemoryAdapter;
  applyResumeSelection?: ApplyResumeSelection;
}

export async function processChat<Options = unknown>({
  messages,
  options,
  sessionId,
  defaultWorkflowId,
  loadRuntimeConfig,
  selectWorkflow,
  workflowRegistry,
  frameworkAdapter,
  getProvider,
  memoryAdapter,
  applyResumeSelection,
}: ProcessChatArgs<Options>): Promise<Response> {
  const config = await loadRuntimeConfig(options);
  const runtimeConfig: Parameters<typeof createLangGraph>[1] = {
    ...config,
    getProvider,
    ...(memoryAdapter ? { memoryAdapter } : {}),
    ...(frameworkAdapter
      ? { checkpointer: frameworkAdapter.checkpointer }
      : {}),
  };

  const workflowSelector: SelectWorkflowFn | null =
    selectWorkflow ??
    (workflowRegistry ? (id) => workflowRegistry.select(id) : null);
  if (!workflowSelector) {
    throw new Error(
      "processChat requires selectWorkflow or workflowRegistry to resolve workflows.",
    );
  }

  const fallbackSessionId = (options as { sessionId?: string } | undefined)
    ?.sessionId;
  const resolvedSessionId =
    sessionId || fallbackSessionId || "anonymous-session";
  const last = messages[messages.length - 1];
  const input = extractLatestUserMessage(messages);

  const previousMessages = messages.slice(0, -1);
  const memory: MemoryEnvelope = {
    ...(previousMessages.length > 0
      ? { conversationMessages: previousMessages }
      : {}),
  } as MemoryEnvelope;

  const isResumeRequest = Boolean(parseResumeMeta(last));
  const requestedWorkflowId = (() => {
    if (!options) return undefined;
    if (typeof options !== "object") return undefined;
    const record = options as Record<string, unknown>;
    const wfId = record.workflowId;
    if (typeof wfId === "string") return wfId;
    const wf = record.workflow;
    if (typeof wf === "string") return wf;
    return undefined;
  })();
  if (!isResumeRequest && requestedWorkflowId) {
    if (requestedWorkflowId.trim() === "") delete memory.currentWorkflow;
    else memory.currentWorkflow = requestedWorkflowId;
  }

  const baseState = await buildInitialGraphState({
    input,
    config: runtimeConfig,
    memory,
    ...(defaultWorkflowId ? { defaultWorkflowId } : {}),
  });

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
  const currentWorkflow = baseState.currentWorkflow;
  const selectedWorkflow = await workflowSelector(currentWorkflow as string);

  const graph = await createLangGraph(selectedWorkflow, runtimeConfig);

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
