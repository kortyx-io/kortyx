import type { GraphState } from "@kortyx/core";
import type {
  FrameworkAdapter,
  PendingRequestRecord,
  PendingRequestStore,
} from "@kortyx/runtime";
import { createExecutionGraph } from "@kortyx/runtime";
import type { StreamChunk } from "@kortyx/stream";
import type { SelectWorkflowFn } from "../orchestrator";
import { type OrchestrateArgs, orchestrateGraphStream } from "../orchestrator";
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
  lastMessage: ChatMessage | undefined;
  sessionId: string;
  config: Record<string, unknown>;
  selectWorkflow: SelectWorkflowFn;
  defaultWorkflowId?: string;
  applyResumeSelection?: ApplyResumeSelection;
  frameworkAdapter?: FrameworkAdapter;
}

export async function tryPrepareResumeStream({
  lastMessage,
  sessionId,
  config,
  selectWorkflow,
  defaultWorkflowId,
  applyResumeSelection,
  frameworkAdapter,
}: TryResumeArgs): Promise<AsyncIterable<StreamChunk> | null> {
  const meta = parseResumeMeta(lastMessage);
  if (!meta) return null;

  const store: PendingRequestStore | undefined =
    frameworkAdapter?.pendingRequests;
  if (!store) return null;

  const pending = await store.get(meta.token);
  if (!pending || pending.requestId !== meta.requestId) {
    // Invalid/expired; ignore and continue normal flow
    // eslint-disable-next-line no-console
    console.log(
      `[resume] pending not found or mismatched. token=${meta.token} requestId=${meta.requestId}`,
    );
    return null;
  }

  if (meta.cancel) {
    await store.delete(pending.token);
    return null;
  }

  // Build a minimal state; the checkpointer (keyed by sessionId) will restore paused context
  // eslint-disable-next-line no-console
  console.log(
    `[resume] token=${meta.token} requestId=${meta.requestId} selected=${JSON.stringify(
      meta.selected,
    )} sessionId=${sessionId}`,
  );

  const resumeData = applyResumeSelection
    ? applyResumeSelection({ pending, selected: meta.selected })
    : meta.selected?.length
      ? { coordinates: String(meta.selected[0]) }
      : {};

  const resumeDataPatch = isRecord(resumeData) ? resumeData : {};
  const pendingMeta = isRecord(pending.schema?.meta) ? pending.schema.meta : {};
  const resumeMemoryPatch = isRecord(pendingMeta.__kortyxResumeMemory)
    ? pendingMeta.__kortyxResumeMemory
    : undefined;

  const pendingData = isRecord(pending.state?.data) ? pending.state?.data : {};
  const workflowId =
    typeof pending.workflow === "string" && pending.workflow.trim()
      ? pending.workflow
      : typeof defaultWorkflowId === "string" && defaultWorkflowId.trim()
        ? defaultWorkflowId
        : "job-search";

  const resumedState = {
    // For static breakpoints, resume with null input (set in orchestrator),
    // and stash the user selection into data so the next node can read it.
    input: "",
    lastNode: "__start__",
    currentWorkflow: workflowId,
    config,
    memory: {},
    conversationHistory: [],
    awaitingHumanInput: false,
    data: {
      ...pendingData,
      ...resumeDataPatch,
    },
  } satisfies GraphState;

  const wf = await selectWorkflow(resumedState.currentWorkflow as string);
  const resumeUpdate: Record<string, unknown> = {};
  if (Object.keys(resumeDataPatch).length > 0) {
    resumeUpdate.data = {
      ...pendingData,
      ...resumeDataPatch,
    };
  }
  if (resumeMemoryPatch) {
    resumeUpdate.memory = resumeMemoryPatch;
  }
  const hasResumeUpdate = Object.keys(resumeUpdate).length > 0;
  const resumeValue =
    meta.selected?.length && pending.schema.kind === "multi-choice"
      ? meta.selected.map((x) => String(x))
      : meta.selected?.length
        ? String(meta.selected[0])
        : undefined;
  const resumedGraph = await createExecutionGraph(wf, {
    ...config,
    resume: true,
    ...(resumeValue !== undefined ? { resumeValue } : {}),
    ...(hasResumeUpdate ? { resumeUpdate } : {}),
  });
  await store.delete(pending.token);

  const args = {
    sessionId,
    runId: pending.runId,
    graph: resumedGraph,
    state: resumedState,
    config: {
      ...config,
      resume: true,
      ...(resumeValue !== undefined ? { resumeValue } : {}),
      ...(hasResumeUpdate ? { resumeUpdate } : {}),
    },
    selectWorkflow,
    ...(frameworkAdapter ? { frameworkAdapter } : {}),
  } satisfies OrchestrateArgs;

  const stream = await orchestrateGraphStream(args);
  return stream as unknown as AsyncIterable<StreamChunk>;
}
