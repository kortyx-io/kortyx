import type { StreamChunk } from "@kortyx/stream";
import type { EvalJson } from "./types";

export function toEvalJson(value: unknown): EvalJson {
  return JSON.parse(JSON.stringify(value)) as EvalJson;
}

/** Select public stream fields explicitly: transport chunks can carry private state. */
export function captureEvalEvent(chunk: StreamChunk): EvalJson | undefined {
  const source = {
    ...("node" in chunk ? { node: chunk.node } : {}),
    ...("id" in chunk ? { id: chunk.id } : {}),
    ...("opId" in chunk ? { opId: chunk.opId } : {}),
  };
  switch (chunk.type) {
    case "tool-call-start":
      return toEvalJson({
        type: chunk.type,
        ...source,
        tool: chunk.tool,
        toolCallId: chunk.toolCallId,
        input: chunk.input,
      });
    case "tool-call-result":
      return toEvalJson({
        type: chunk.type,
        ...source,
        tool: chunk.tool,
        toolCallId: chunk.toolCallId,
        content: chunk.content,
        structuredContent: chunk.structuredContent,
        isError: chunk.isError,
      });
    case "tool-call-error":
      return toEvalJson({
        type: chunk.type,
        ...source,
        tool: chunk.tool,
        toolCallId: chunk.toolCallId,
        message: chunk.message,
      });
    case "tool-result":
      return toEvalJson({
        type: chunk.type,
        ...source,
        tool: chunk.tool,
        content: chunk.content,
      });
    case "text-start":
    case "text-end":
      return toEvalJson({
        type: chunk.type,
        ...source,
        segmentId: chunk.segmentId,
      });
    case "text-delta":
      return toEvalJson({
        type: chunk.type,
        ...source,
        segmentId: chunk.segmentId,
        delta: chunk.delta,
      });
    case "message":
      return toEvalJson({
        type: chunk.type,
        ...source,
        content: chunk.content,
      });
    case "status":
      return toEvalJson({
        type: chunk.type,
        ...source,
        message: chunk.message,
      });
    case "interrupt": {
      // Keep the UI request and its place in execution, never its resume token
      // or arbitrary transport metadata.
      const input = chunk.input;
      return toEvalJson({
        type: chunk.type,
        ...source,
        requestId: chunk.requestId,
        workflow: chunk.workflow,
        schemaId: chunk.schemaId ?? input.schemaId,
        schemaVersion: chunk.schemaVersion ?? input.schemaVersion,
        input: {
          kind: input.kind,
          multiple: input.multiple,
          question: input.question,
          options: input.options,
          ...(input.kind === "custom" ? { request: input.request } : {}),
        },
      });
    }
    case "structured-data":
      return toEvalJson({
        type: chunk.type,
        ...source,
        streamId: chunk.streamId,
        dataType: chunk.dataType,
        kind: chunk.kind,
        schemaId: chunk.schemaId,
        schemaVersion: chunk.schemaVersion,
        ...(chunk.kind === "final"
          ? { data: chunk.data }
          : { path: chunk.path }),
        ...(chunk.kind === "set" ? { value: chunk.value } : {}),
        ...(chunk.kind === "append" ? { items: chunk.items } : {}),
        ...(chunk.kind === "text-delta" ? { delta: chunk.delta } : {}),
      });
    case "structured-data-invalidated":
      return toEvalJson({
        type: chunk.type,
        streamId: chunk.streamId,
        checkpointId: chunk.checkpointId,
      });
    case "transition":
      return { type: chunk.type, transitionTo: chunk.transitionTo };
    case "error":
      return { type: chunk.type, message: chunk.message };
    case "cancelled":
      return toEvalJson({
        type: chunk.type,
        runId: chunk.runId,
        reason: chunk.reason,
      });
    case "limit-reached":
      return {
        type: chunk.type,
        runId: chunk.runId,
        limit: chunk.limit,
        maximum: chunk.maximum,
        consumed: chunk.consumed,
      };
    case "done":
      // done.data is a graph state, not an agent answer.
      return { type: chunk.type };
    default:
      // Trace and checkpoint IDs are already captured in the observation.
      // Session/control events are not grading evidence.
      return undefined;
  }
}
