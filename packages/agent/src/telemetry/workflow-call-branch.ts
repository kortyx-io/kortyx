import { randomUUID } from "node:crypto";
import { emitWorkflowCall, type KortyxTelemetryConfig } from "@kortyx/hooks";
import type { ToolObservation } from "@kortyx/providers";
import type { PendingRequestRecord } from "@kortyx/runtime";

/** Rebase every snapshot copy; emit each inherited logical invocation only once. */
export function restoreWorkflowCallBranch(
  requests: PendingRequestRecord[],
  telemetry: KortyxTelemetryConfig | undefined,
  sourceRunId: string,
) {
  const branchId = randomUUID();
  const emitted = new Set<string>();
  const toolEvidence = new Set<string>();
  for (const request of requests) {
    if (request.state)
      request.state.config = {
        ...request.state.config,
        executionBranchId: branchId,
      };
    const seen = new Set<object>();
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      const record = value as Record<string, unknown>;
      if (
        typeof record.invocationId === "string" &&
        typeof record.fingerprint === "string" &&
        Array.isArray(record.interrupts)
      ) {
        const previous = record.telemetry as
          | Record<string, unknown>
          | undefined;
        if (previous) {
          record.sequence = 0;
          record.telemetry = { ...previous, branchId };
          if (!emitted.has(record.invocationId)) {
            emitted.add(record.invocationId);
            emitWorkflowCall(
              telemetry
                ? {
                    ...telemetry,
                    correlation: {
                      runId: request.runId,
                      workflowId: request.workflow,
                      ...(request.sessionId
                        ? { sessionId: request.sessionId }
                        : {}),
                    },
                  }
                : undefined,
              "workflow.call.restored",
              {
                ...previous,
                branchId,
                sourceBranchId: previous.branchId,
                sourceRunId,
                sequence: 0,
                status: record.status,
              },
            );
            if (
              record.status === "completed" &&
              Array.isArray(record.toolObservations)
            ) {
              if (
                telemetry?.reporter &&
                telemetry.environment &&
                telemetry.service
              )
                record.restoredToolBranch = branchId;
              for (const original of record.toolObservations as ToolObservation[]) {
                const key = JSON.stringify([
                  original.invocationId,
                  original.toolCallId,
                  original.attemptId,
                ]);
                if (toolEvidence.has(key)) continue;
                toolEvidence.add(key);
                const payload = {
                  ...original,
                  runId: request.runId,
                  branchId,
                  attemptId: randomUUID(),
                  executed: false,
                  durationMs: undefined,
                  observationKind: "reused",
                  source: original.source ?? {
                    runId: original.runId ?? sourceRunId,
                    invocationId: original.invocationId,
                    branchId: original.branchId,
                    toolCallId: original.toolCallId,
                    attemptId: original.attemptId,
                  },
                };
                emitWorkflowCall(
                  telemetry
                    ? {
                        ...telemetry,
                        correlation: {
                          runId: request.runId,
                          sessionId: request.sessionId,
                          workflowId: original.workflowId ?? request.workflow,
                          nodeId: original.nodeId,
                          workflowRevisionId: original.workflowRevisionId,
                          invocationId: original.invocationId,
                          parentInvocationId: original.parentInvocationId,
                          branchId,
                        },
                      }
                    : undefined,
                  "tool.reused",
                  payload,
                );
              }
            }
          }
        }
      }
      for (const child of Object.values(record)) visit(child);
    };
    visit(request);
  }
  return branchId;
}
