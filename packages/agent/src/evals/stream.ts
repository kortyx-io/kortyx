import {
  type PromptSnapshot,
  type PromptUsageReceipt,
  verifyPromptSnapshot,
} from "@kortyx/prompts";
import {
  createFinalizedChatMessageAccumulator,
  type StreamChunk,
} from "@kortyx/stream";
import type { AgentProcessOptions } from "../chat/create-agent";
import type { ChatResponseFinalized } from "../chat/lifecycle";
import type { ChatMessage } from "../types/chat-message";
import { promptEvaluationContext } from "./prompt-context";
import { captureEvalEvent, toEvalJson } from "./stream-evidence";
import type {
  CreateEvalsOptions,
  EvalCommand,
  EvalExecution,
  EvalJson,
  EvalObservation,
} from "./types";

export { toEvalJson } from "./stream-evidence";

type Pending = Extract<StreamChunk, { type: "interrupt" }>;

export async function executeEvalChat(args: {
  agent: CreateEvalsOptions["agent"];
  promptSnapshot?: PromptSnapshot;
  command: EvalCommand;
  continuation?: unknown;
  history: readonly ChatMessage[];
  sessionId: string;
  clientTurnId: string;
  workflowId?: string;
  signal: AbortSignal;
  context?: Record<string, unknown>;
  messages?: ChatMessage[];
}): Promise<EvalExecution> {
  if (args.promptSnapshot) {
    const snapshot = await verifyPromptSnapshot(args.promptSnapshot);
    const receipts: PromptUsageReceipt[] = [];
    const { promptSnapshot: _, ...executionArgs } = args;
    const result = await promptEvaluationContext.run(
      { snapshot, onUsage: (receipt) => receipts.push(receipt) },
      () => executeEvalChat(executionArgs),
    );
    result.observation.promptUsage = receipts;
    return result;
  }
  const waiting = args.continuation as Pending[] | undefined;
  // Cancel every observed request, even when the conversation cannot represent
  // parallel human interactions. Their tokens stay inside this executor.
  if (args.command.type === "cancel" && waiting && waiting.length > 1) {
    let failed = false;
    for (const pending of waiting) {
      try {
        const result = await executeEvalChat({
          ...args,
          continuation: [pending],
        });
        if (result.observation.type === "error" || result.continuation)
          failed = true;
      } catch {
        failed = true;
      }
    }
    if (failed) throw new Error("Could not cancel all waiting interrupts.");
    return { observation: { type: "cancelled", text: "", structured: [] } };
  }
  const pending = waiting?.[0];
  const messages: ChatMessage[] = [...(args.messages ?? args.history)];
  if (args.command.type === "message")
    messages.push({ role: "user", content: args.command.message });
  else {
    if (!pending?.resumeToken || !pending.requestId)
      throw new Error("No waiting interrupt to resume.");
    const response =
      args.command.type === "cancel"
        ? ({ type: "cancel" } as const)
        : args.command.response;
    messages.push({
      role: "user",
      content:
        response.type === "text"
          ? response.text
          : response.type === "select"
            ? response.ids.join(", ")
            : response.type === "value"
              ? JSON.stringify(response.value)
              : "",
      metadata: {
        resume: {
          token: pending.resumeToken,
          requestId: pending.requestId,
          ...(response.type === "text" ? { selected: [response.text] } : {}),
          ...(response.type === "select" ? { selected: response.ids } : {}),
          ...(response.type === "value" ? { value: response.value } : {}),
          ...(response.type === "cancel" ? { cancel: true } : {}),
        },
      },
    });
  }
  const accumulator = createFinalizedChatMessageAccumulator(args.clientTurnId);
  let completion: Promise<void> | undefined;
  let finalized: ChatResponseFinalized | undefined;
  const interrupts = new Map<string, Pending>();
  const events: EvalJson[] = [];
  let previousChunk: StreamChunk | undefined;
  let error = false;
  let cancelled = false;
  let sawDone = false;
  let completedWithData = false;
  let runId: string | undefined;
  const options: AgentProcessOptions = {
    sessionId: args.sessionId,
    clientTurnId: args.clientTurnId,
    abortSignal: args.signal,
    executionSignal: args.signal,
    onExecution: (value) => {
      completion = value;
      void value.catch(() => {});
    },
    onResponseFinalized: (event) => {
      finalized = event;
    },
    ...(args.workflowId ? { workflowId: args.workflowId } : {}),
    ...(args.context ? { context: args.context } : {}),
  };
  try {
    for await (const chunk of await args.agent.streamChat(messages, options)) {
      accumulator.apply(chunk);
      const event = captureEvalEvent(chunk);
      if (event !== undefined) {
        // Preserve interleaving and text segment boundaries while avoiding one
        // judge record per streamed token.
        if (
          chunk.type === "text-delta" &&
          previousChunk?.type === "text-delta" &&
          chunk.node === previousChunk.node &&
          chunk.id === previousChunk.id &&
          chunk.opId === previousChunk.opId &&
          chunk.segmentId === previousChunk.segmentId
        ) {
          const previous = events.at(-1) as Record<string, EvalJson>;
          events[events.length - 1] = {
            ...previous,
            delta: String(previous.delta) + chunk.delta,
          };
        } else events.push(event);
      }
      previousChunk = chunk;
      if (chunk.type === "interrupt") interrupts.set(chunk.requestId, chunk);
      if (chunk.type === "error") error = true;
      if (chunk.type === "cancelled") cancelled = true;
      if (chunk.type === "trace") runId = chunk.runId;
      if (chunk.type === "done") {
        sawDone = true;
        completedWithData = chunk.data !== undefined;
      }
    }
  } finally {
    await completion;
  }
  // Early response completion can hide later execution failures and human requests.
  // The initial runner requires an application executor to observe that lifecycle.
  if (
    args.command.type !== "cancel" &&
    !error &&
    !cancelled &&
    !interrupts.size &&
    (!sawDone || !completedWithData)
  )
    throw new Error(
      "Incomplete or background-only execution requires a custom eval executor.",
    );
  const message = finalized?.message ?? accumulator.message();
  const piece = message.contentPieces.find((item) => item.type === "interrupt");
  const observedRunId = finalized?.runId ?? runId;
  const type: EvalObservation["type"] =
    error || finalized?.status === "failed" || interrupts.size > 1
      ? "error"
      : cancelled || finalized?.status === "cancelled"
        ? "cancelled"
        : interrupts.size
          ? "interrupt"
          : "answer";
  const observation: EvalObservation = {
    type,
    text: message.content,
    structured: message.contentPieces
      .filter((item) => item.type === "structured")
      .map((item) => toEvalJson(item.data)),
    events,
    ...(observedRunId ? { runId: observedRunId } : {}),
    ...(message.checkpointId ? { checkpointId: message.checkpointId } : {}),
    ...(type === "interrupt" && piece?.type === "interrupt"
      ? {
          interrupt: {
            requestId: piece.requestId,
            kind: piece.kind,
            options: piece.options,
            ...(piece.question !== undefined
              ? { question: piece.question }
              : {}),
            ...(piece.schemaId ? { schemaId: piece.schemaId } : {}),
            ...(piece.schemaVersion
              ? { schemaVersion: piece.schemaVersion }
              : {}),
            ...(piece.request !== undefined
              ? { request: toEvalJson(piece.request) }
              : {}),
          },
        }
      : {}),
  };
  return {
    observation,
    ...(interrupts.size ? { continuation: [...interrupts.values()] } : {}),
  };
}
