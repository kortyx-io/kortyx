import type { RuntimeEnvelope } from "@kortyx/core";
import type { GetProviderFn } from "@kortyx/providers";
import type { FrameworkAdapter, WorkflowRegistry } from "@kortyx/runtime";
import {
  buildInitialGraphState,
  createExecutionGraph,
  makeRequestId,
} from "@kortyx/runtime";
import type { StreamChunk } from "@kortyx/stream";
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

export interface StreamChatArgs<Options> {
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
  applyResumeSelection?: ApplyResumeSelection;
}

export async function streamChat<Options = unknown>({
  messages,
  options,
  sessionId,
  defaultWorkflowId,
  loadRuntimeConfig,
  selectWorkflow,
  workflowRegistry,
  frameworkAdapter,
  getProvider,
  applyResumeSelection,
}: StreamChatArgs<Options>): Promise<AsyncIterable<StreamChunk>> {
  const config = await loadRuntimeConfig(options);
  const runtimeConfig: Parameters<typeof createExecutionGraph>[1] = {
    ...config,
    getProvider,
    ...(frameworkAdapter
      ? { checkpointer: frameworkAdapter.checkpointer }
      : {}),
  };

  const workflowSelector: SelectWorkflowFn | null =
    selectWorkflow ??
    (workflowRegistry ? (id) => workflowRegistry.select(id) : null);
  if (!workflowSelector) {
    throw new Error(
      "streamChat requires selectWorkflow or workflowRegistry to resolve workflows.",
    );
  }

  const fallbackSessionId = (options as { sessionId?: string } | undefined)
    ?.sessionId;
  const resolvedSessionId =
    sessionId || fallbackSessionId || "anonymous-session";
  const last = messages[messages.length - 1];
  const input = extractLatestUserMessage(messages);

  const previousMessages = messages.slice(0, -1);
  const runtime: RuntimeEnvelope = {
    ...(previousMessages.length > 0 ? { priorMessages: previousMessages } : {}),
  } as RuntimeEnvelope;

  const isResumeRequest = Boolean(parseResumeMeta(last));
  const requestedWorkflowId = (() => {
    if (!options) return undefined;
    if (typeof options !== "object") return undefined;
    const record = options as Record<string, unknown>;
    const wfId = record.workflowId;
    if (typeof wfId === "string") return wfId;
    return undefined;
  })();
  if (!isResumeRequest && requestedWorkflowId) {
    if (requestedWorkflowId.trim() === "") delete runtime.requestedWorkflow;
    else runtime.requestedWorkflow = requestedWorkflowId;
  }

  const baseState = await buildInitialGraphState({
    input,
    config: runtimeConfig,
    runtime,
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
  if (resumeStream) return resumeStream as AsyncIterable<StreamChunk>;

  const runId = makeRequestId("run");
  let headCheckpoint =
    !isResumeRequest && frameworkAdapter?.sessionCheckpoints
      ? await frameworkAdapter.sessionCheckpoints.getHead(resolvedSessionId)
      : null;
  if (
    !isResumeRequest &&
    !headCheckpoint &&
    frameworkAdapter?.sessionCheckpoints
  ) {
    headCheckpoint = await frameworkAdapter.sessionCheckpoints.append({
      sessionId: resolvedSessionId,
      runId,
      workflow: String(baseState.currentWorkflow),
      state: {
        ...baseState,
        input: "",
        awaitingHumanInput: false,
      },
      nodes: [],
      structuredStreamIds: [],
      pendingRequests: [],
      label: "session start",
    });
  }
  const currentWorkflow = requestedWorkflowId
    ? baseState.currentWorkflow
    : (headCheckpoint?.state.currentWorkflow ?? baseState.currentWorkflow);
  const selectedWorkflow = await workflowSelector(currentWorkflow as string);

  const graph = await createExecutionGraph(selectedWorkflow, runtimeConfig);
  const initialState = headCheckpoint
    ? {
        ...headCheckpoint.state,
        input,
        config: runtimeConfig,
        currentWorkflow,
        awaitingHumanInput: false,
        runtime: {
          ...(headCheckpoint.state.runtime ?? {}),
          ...(runtime.requestedWorkflow
            ? { requestedWorkflow: runtime.requestedWorkflow }
            : {}),
          ...(runtime.priorMessages
            ? { priorMessages: runtime.priorMessages }
            : {}),
        },
      }
    : { ...baseState, currentWorkflow };

  const orchestratedStream = await orchestrateGraphStream({
    sessionId: resolvedSessionId,
    runId,
    graph,
    state: initialState,
    config: runtimeConfig,
    selectWorkflow: workflowSelector,
    ...(frameworkAdapter ? { frameworkAdapter } : {}),
  });

  return orchestratedStream as AsyncIterable<StreamChunk>;
}
