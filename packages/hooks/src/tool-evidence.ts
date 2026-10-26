import type { ToolObservation } from "@kortyx/providers";
import { getHookContext } from "./context";

/** Public capture is separate from metadata-only telemetry observations. */
export type DirectToolEvidence = {
  tool: string;
  toolCallId: string;
  node: string;
  execution: Pick<
    ToolObservation,
    | "callingMode"
    | "attemptId"
    | "executed"
    | "outcome"
    | "workflowId"
    | "nodeId"
    | "workflowRevisionId"
    | "runId"
    | "invocationId"
    | "parentInvocationId"
    | "branchId"
    | "source"
  > & { inputOmitted?: string; resultOmitted?: string };
  input?: unknown;
  content?: unknown;
  structuredContent?: unknown;
  isError?: boolean;
};

export type ToolContentCapture =
  | boolean
  | { input?: boolean; output?: boolean };

/** Omit a whole value rather than passing truncated JSON off as retrieved facts. */
export function captureToolValue(
  value: unknown,
  enabled: boolean,
): { value: unknown; omitted?: never } | { omitted: string; value?: never } {
  if (!enabled) return { omitted: "disabled: enable useTool({ emit: true })" };
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return { omitted: "not JSON serializable" };
    if (Buffer.byteLength(json, "utf8") > 16_384)
      return { omitted: "content exceeds 16 KiB" };
    return { value: JSON.parse(json) };
  } catch {
    return { omitted: "not JSON serializable" };
  }
}

export function directToolIdentity(
  observation: ToolObservation,
): DirectToolEvidence {
  const {
    attemptId,
    executed,
    callingMode,
    outcome,
    workflowId,
    nodeId,
    workflowRevisionId,
    runId,
    branchId,
    invocationId,
    parentInvocationId,
  } = observation;
  return {
    tool: observation.name,
    toolCallId: observation.toolCallId,
    node: nodeId ?? getHookContext().node.graph.node,
    execution: {
      attemptId,
      executed,
      callingMode,
      ...(outcome ? { outcome } : {}),
      workflowId,
      nodeId,
      workflowRevisionId,
      runId,
      branchId,
      invocationId,
      parentInvocationId,
    },
  };
}

export function captureToolResult(
  value: unknown,
  enabled: boolean,
): Pick<DirectToolEvidence, "content" | "structuredContent" | "isError"> & {
  resultOmitted?: string;
} {
  if (!enabled)
    return { resultOmitted: "disabled: enable useTool({ emit: true })" };
  try {
    let publicValue = value;
    const envelope =
      value &&
      typeof value === "object" &&
      "content" in value &&
      typeof value.content === "string" &&
      "toolCallId" in value;
    if (envelope) {
      const result = value as {
        content: string;
        structuredContent?: unknown;
        isError?: unknown;
      };
      publicValue = {
        content: result.content,
        ...(result.structuredContent !== undefined
          ? { structuredContent: result.structuredContent }
          : {}),
        ...(typeof result.isError === "boolean"
          ? { isError: result.isError }
          : {}),
      };
    }
    const captured = captureToolValue(publicValue, true);
    if (captured.omitted) return { resultOmitted: captured.omitted };
    if (envelope)
      return captured.value as Pick<
        DirectToolEvidence,
        "content" | "structuredContent" | "isError"
      >;
    return {
      content:
        typeof captured.value === "string"
          ? captured.value
          : JSON.stringify(captured.value),
      ...(captured.value !== null && typeof captured.value === "object"
        ? { structuredContent: captured.value }
        : {}),
    };
  } catch {
    return { resultOmitted: "not JSON serializable" };
  }
}

export function rememberDirectToolEvidence(evidence: DirectToolEvidence): void {
  const ctx = getHookContext();
  const existing = ctx.workflowState.__kortyxDirectToolEvidence;
  const entries: DirectToolEvidence[] = Array.isArray(existing) ? existing : [];
  if (
    !entries.some(
      (entry) => entry.execution.attemptId === evidence.execution.attemptId,
    )
  )
    entries.push(evidence);
  ctx.workflowState.__kortyxDirectToolEvidence = entries;
  ctx.stateDirty = true;
}

export function emitDirectToolEvidence(
  evidence: DirectToolEvidence,
  phase: "start" | "result" | "both" = "both",
): void {
  const { input, content, structuredContent, isError, ...identity } = evidence;
  const ctx = getHookContext();
  try {
    if (phase !== "result")
      ctx.node.emit("tool-call-start", {
        ...identity,
        ...(input !== undefined ? { input } : {}),
      });
    if (phase !== "start")
      ctx.node.emit("tool-call-result", {
        ...identity,
        content:
          content ??
          `Tool result unavailable: ${evidence.execution.resultOmitted ?? "not returned"}`,
        ...(structuredContent !== undefined ? { structuredContent } : {}),
        ...(isError !== undefined ? { isError } : {}),
      });
  } catch {
    // Evidence delivery must never turn a successful operation into a retry.
  }
}

export function replayDirectToolEvidence(
  entries: readonly DirectToolEvidence[],
): void {
  const owner = getHookContext().node.toolExecutionOwner;
  for (const entry of entries) {
    const original = entry.execution;
    const replay = {
      ...entry,
      execution: {
        ...original,
        runId: owner?.runId ?? original.runId,
        branchId: owner?.branchId ?? original.branchId,
        executed: false,
        source: original.source ?? {
          runId: original.runId,
          invocationId: original.invocationId,
          branchId: original.branchId,
          toolCallId: entry.toolCallId,
          attemptId: original.attemptId,
        },
      },
    };
    emitDirectToolEvidence(replay);
    rememberDirectToolEvidence(replay);
  }
}
