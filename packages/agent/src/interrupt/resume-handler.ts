import type { GraphState } from "@kortyx/core";
import {
  createExecutionCancelledError,
  type ExecutionBudget,
  type ExecutionLimits,
  restartExecutionBudget,
} from "@kortyx/core";
import type {
  FrameworkAdapter,
  PendingRequestRecord,
  PendingRequestStore,
} from "@kortyx/runtime";
import { createExecutionGraph, restoreGraphSnapshot } from "@kortyx/runtime";
import type { StreamChunk } from "@kortyx/stream";
import type { SelectWorkflowFn } from "../orchestrator";
import { type OrchestrateArgs, orchestrateGraphStream } from "../orchestrator";
import {
  emitTelemetryEvent,
  shouldCaptureTelemetryContent,
} from "../telemetry/events";
import { prepareWorkflowTelemetry } from "../telemetry/topology";
import type { ChatMessage } from "../types/chat-message";

export interface ResumeMeta {
  token: string;
  requestId: string;
  selected: string[]; // normalized to array for consistency
  cancel?: boolean;
}

export type ApplyResumeSelection = (args: {
  pending: PendingRequestRecord;
  selected: string[];
}) => Record<string, unknown> | null | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const responseFromSelection = (selected: string[]): string | undefined => {
  if (selected.length === 0) return undefined;
  if (selected.length === 1) return selected[0];
  return JSON.stringify(selected);
};

export function parseResumeMeta(
  msg: ChatMessage | undefined,
): ResumeMeta | null {
  if (!msg || !msg.metadata) return null;
  const raw = msg.metadata.resume;
  if (!isRecord(raw)) return null;

  const token = typeof raw.token === "string" ? raw.token : "";
  const requestId = typeof raw.requestId === "string" ? raw.requestId : "";
  const cancel = raw.cancel === true;

  // Accept multiple shapes; normalize to selected: string[]
  let selected: string[] = [];
  const rawSelected = raw.selected;
  if (typeof rawSelected === "string") selected = [rawSelected];
  else if (Array.isArray(rawSelected)) selected = rawSelected.map(String);
  else if (isRecord(raw.choice) && typeof raw.choice.id === "string")
    selected = [raw.choice.id];
  else if (Array.isArray(raw.choices))
    selected = raw.choices
      .map((c) => (isRecord(c) ? c.id : undefined))
      .filter((id): id is string => typeof id === "string");

  if (!token || !requestId) return null;
  return { token, requestId, selected, cancel };
}

interface TryResumeArgs {
  limits?: ExecutionLimits | undefined;
  abortSignal?: AbortSignal | undefined;
  lastMessage?: ChatMessage | undefined;
  meta?: ResumeMeta | undefined;
  emitOutput?: boolean | undefined;
  onOutcome?: OrchestrateArgs["onOutcome"];
  validatePending?:
    | ((pending: PendingRequestRecord) => void | Promise<void>)
    | undefined;
  sessionId: string;
  config: Record<string, unknown>;
  selectWorkflow: SelectWorkflowFn;
  knownWorkflowIds?: readonly string[] | undefined;
  defaultWorkflowId?: string;
  applyResumeSelection?: ApplyResumeSelection;
  frameworkAdapter?: FrameworkAdapter;
}

export async function tryPrepareResumeStream({
  limits,
  abortSignal,
  lastMessage,
  meta: suppliedMeta,
  emitOutput,
  onOutcome,
  validatePending,
  sessionId,
  config,
  selectWorkflow,
  knownWorkflowIds,
  defaultWorkflowId,
  applyResumeSelection,
  frameworkAdapter,
}: TryResumeArgs): Promise<AsyncIterable<StreamChunk> | null> {
  const meta = suppliedMeta ?? parseResumeMeta(lastMessage);
  if (!meta) return null;

  const store: PendingRequestStore | undefined =
    frameworkAdapter?.pendingRequests;
  if (!store) return null;

  const pending = await store.get(meta.token);
  if (!pending || pending.requestId !== meta.requestId) {
    throw new Error(
      "Interrupt is expired, already consumed, or does not match the request.",
    );
  }

  if (pending.sessionId && pending.sessionId !== sessionId)
    throw new Error("Interrupt belongs to another session.");
  await validatePending?.(pending);
  const isLimitPause = Boolean(pending.schema.meta?.__kortyxExecutionLimit);

  const savedBudget = pending.state?.config?.executionBudget as
    | ExecutionBudget
    | undefined;
  const resumedBudget =
    savedBudget && isLimitPause && !meta.cancel
      ? restartExecutionBudget(savedBudget, limits)
      : savedBudget;
  if (abortSignal?.aborted) {
    onOutcome?.({
      state: pending.state as GraphState,
      error: createExecutionCancelledError(),
    });
    return (async function* () {
      yield {
        type: "cancelled",
        runId: pending.runId,
        reason: "Execution cancelled.",
      } as const;
      yield { type: "done" } as const;
    })();
  }
  if (store.take && !(await store.take(meta.token)))
    throw new Error("Interrupt has already been resumed or cancelled.");
  if (meta.cancel) {
    await store.delete(pending.token);
    emitTelemetryEvent({
      config,
      type: "interrupt.cancelled",
      correlation: {
        runId: pending.runId,
        sessionId,
        workflowId: pending.workflow,
        nodeId: pending.node,
      },
      payload: {
        interruptId: pending.requestId,
        reason: "cancelled_by_client",
      },
      flush: true,
    });
    onOutcome?.({ state: pending.state as GraphState, cancelled: true });
    return (async function* (): AsyncGenerator<StreamChunk> {
      yield { type: "done" };
    })();
  }

  try {
    const resumeData = isLimitPause
      ? {}
      : applyResumeSelection
        ? applyResumeSelection({ pending, selected: meta.selected })
        : meta.selected?.length
          ? { coordinates: String(meta.selected[0]) }
          : {};

    const resumeDataPatch = isRecord(resumeData) ? resumeData : {};
    const pendingMeta = isRecord(pending.schema?.meta)
      ? pending.schema.meta
      : {};
    const resumeStatePatch = isRecord(pendingMeta.__kortyxResumeStatePatch)
      ? pendingMeta.__kortyxResumeStatePatch
      : undefined;

    const pendingData = isRecord(pending.state?.data)
      ? pending.state?.data
      : {};
    const workflowId =
      typeof pending.workflow === "string" && pending.workflow.trim()
        ? pending.workflow
        : typeof defaultWorkflowId === "string" && defaultWorkflowId.trim()
          ? defaultWorkflowId
          : "job-search";

    const resumedState = {
      // For static breakpoints, resume with null input (set in orchestrator),
      // and stash the user selection into data so the next node can read it.
      input: pending.state ? pending.state.input : "",
      lastNode: "__start__",
      currentWorkflow: workflowId,
      config,
      runtime: {},
      conversationHistory: [],
      awaitingHumanInput: false,
      data: {
        ...pendingData,
        ...resumeDataPatch,
      },
    } satisfies GraphState;

    const wf = await selectWorkflow(resumedState.currentWorkflow as string);
    const telemetryConfig = prepareWorkflowTelemetry({
      config: {
        ...config,
        ...(resumedBudget ? { executionBudget: resumedBudget } : {}),
        ...(pending.state?.config?.context
          ? { context: pending.state.config.context }
          : {}),
        ...(pending.state?.config?.executionContract
          ? { executionContract: pending.state.config.executionContract }
          : {}),
        ...(pending.state?.config?.executionBranchId
          ? { executionBranchId: pending.state.config.executionBranchId }
          : {}),
      },
      workflow: wf,
      runId: pending.runId,
      sessionId,
      knownWorkflowIds,
    });
    resumedState.config = telemetryConfig;
    const resumeUpdate: Record<string, unknown> = pending.graphSnapshot
      ? {
          config: {
            ...telemetryConfig,
            context: pending.state?.config?.context ?? telemetryConfig.context,
          },
        }
      : {};
    if (isLimitPause && pending.graphSnapshot) {
      pending.graphSnapshot.checkpoint.channel_values.config = telemetryConfig;
      if (resumeStatePatch)
        pending.graphSnapshot.checkpoint.channel_values.runtime = {
          ...(pending.graphSnapshot.checkpoint.channel_values.runtime as Record<
            string,
            unknown
          >),
          ...resumeStatePatch,
        };
    }
    if (pending.graphSnapshot && frameworkAdapter)
      await restoreGraphSnapshot(
        frameworkAdapter.checkpointer,
        pending.graphSnapshot,
        pending.runId,
      );
    if (Object.keys(resumeDataPatch).length > 0) {
      resumeUpdate.data = {
        ...pendingData,
        ...resumeDataPatch,
      };
    }
    if (resumeStatePatch) {
      resumeUpdate.runtime = resumeStatePatch;
    }
    const hasResumeUpdate =
      !isLimitPause && Object.keys(resumeUpdate).length > 0;
    const resumeValue = isLimitPause
      ? undefined
      : meta.selected?.length && pending.schema.kind === "multi-choice"
        ? meta.selected.map((x) => String(x))
        : meta.selected?.length
          ? String(meta.selected[0])
          : undefined;
    const resumeCheckpointId =
      typeof pending.graphCheckpointId === "string" &&
      pending.graphCheckpointId.length > 0
        ? pending.graphCheckpointId
        : undefined;
    const resumedGraph = await createExecutionGraph(wf, {
      ...telemetryConfig,
      resume: true,
      ...(resumeValue !== undefined ? { resumeValue } : {}),
      ...(resumeCheckpointId ? { resumeCheckpointId } : {}),
      ...(hasResumeUpdate ? { resumeUpdate } : {}),
    });
    await store.delete(pending.token);
    const response = responseFromSelection(meta.selected);
    const telemetry = isRecord(telemetryConfig.telemetry)
      ? telemetryConfig.telemetry
      : {};
    const responseCaptured = Boolean(
      response &&
        shouldCaptureTelemetryContent(telemetry.captureContent, "input"),
    );
    emitTelemetryEvent({
      config: telemetryConfig,
      type: "interrupt.resolved",
      correlation: {
        runId: pending.runId,
        sessionId,
        workflowId,
        nodeId: pending.node,
      },
      payload: {
        interruptId: pending.requestId,
        resolvedAt: new Date().toISOString(),
        resumeOutcome: "resumed",
        responseCaptured,
        ...(responseCaptured && response ? { response } : {}),
      },
      flush: true,
    });

    const args = {
      abortSignal,
      emitOutput,
      onOutcome,
      sessionId,
      runId: pending.runId,
      graph: resumedGraph,
      state: resumedState,
      config: {
        ...telemetryConfig,
        resume: true,
        telemetryInterruptId: pending.requestId,
        telemetryInterruptNodeId: pending.node,
        ...(resumeValue !== undefined ? { resumeValue } : {}),
        ...(resumeCheckpointId ? { resumeCheckpointId } : {}),
        ...(hasResumeUpdate ? { resumeUpdate } : {}),
      },
      selectWorkflow,
      knownWorkflowIds,
      frameworkAdapter: frameworkAdapter as FrameworkAdapter,
    } satisfies OrchestrateArgs;

    const stream = await orchestrateGraphStream(args);
    return stream as unknown as AsyncIterable<StreamChunk>;
  } catch (error) {
    await store.save(pending);
    throw error;
  }
}
