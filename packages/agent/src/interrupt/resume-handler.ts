import type { GraphState } from "@kortyx/core";
import type {
  FrameworkAdapter,
  PendingRequestRecord,
  PendingRequestStore,
} from "@kortyx/runtime";
import { createLangGraph } from "@kortyx/runtime";
import type { StreamChunk } from "@kortyx/stream";
import type { SelectWorkflowFn } from "../orchestrator";
import { orchestrateGraphStream } from "../orchestrator";
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

export function parseResumeMeta(
  msg: ChatMessage | undefined,
): ResumeMeta | null {
  if (!msg || !msg.metadata) return null;
  const raw = (msg.metadata as any)?.resume;
  if (!raw) return null;
  const token = typeof raw.token === "string" ? raw.token : "";
  const requestId = typeof raw.requestId === "string" ? raw.requestId : "";
  const cancel = Boolean(raw.cancel);

  // Accept multiple shapes; normalize to selected: string[]
  let selected: string[] = [];
  if (typeof raw.selected === "string") selected = [raw.selected];
  else if (Array.isArray(raw.selected))
    selected = raw.selected.map((x: any) => String(x));
  else if (raw?.choice?.id) selected = [String(raw.choice.id)];
  else if (Array.isArray(raw?.choices))
    selected = raw.choices.map((c: any) => String(c.id));

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

  const resumeDataPatch =
    resumeData && typeof resumeData === "object" ? resumeData : {};

  const resumedState: GraphState = {
    // For static breakpoints, resume with null input (set in orchestrator),
    // and stash the user selection into data so the next node can read it.
    input: "" as any,
    lastNode: "__start__" as any,
    currentWorkflow:
      (pending.workflow as any) ||
      (defaultWorkflowId as any) ||
      ("job-search" as any),
    config: config as any,
    conversationHistory: [],
    awaitingHumanInput: false,
    data: {
      ...(pending.state?.data ?? {}),
      ...resumeDataPatch,
    } as any,
  } as any;

  const wf = await selectWorkflow(resumedState.currentWorkflow as string);
  const resumeValue =
    meta.selected?.length && pending.schema.kind === "multi-choice"
      ? meta.selected.map((x) => String(x))
      : meta.selected?.length
        ? String(meta.selected[0])
        : undefined;
  const resumedGraph = await createLangGraph(wf, {
    ...(config as any),
    resume: true,
    ...(resumeValue !== undefined ? { resumeValue } : {}),
  });
  await store.delete(pending.token);

  const args: any = {
    sessionId,
    runId: pending.runId,
    graph: resumedGraph,
    state: resumedState,
    config: {
      ...(config as any),
      resume: true,
      ...(resumeValue !== undefined ? { resumeValue } : {}),
    },
    selectWorkflow,
    frameworkAdapter,
  };

  const stream = await orchestrateGraphStream(args);
  return stream as AsyncIterable<StreamChunk>;
}
