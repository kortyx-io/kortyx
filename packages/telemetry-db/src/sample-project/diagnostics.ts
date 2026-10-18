import { createHash } from "node:crypto";
import {
  DIAGNOSTIC_LIMITS,
  DiagnosticContentSchema,
  type DiagnosticCorrelationSchema,
  type DiagnosticResponse,
  DiagnosticResponseSchema,
  redactDiagnosticContent,
  SAMPLE_PROJECT,
  ToolObservationSchema,
} from "@kortyx/telemetry-contracts";
import type { TelemetryEventRecord, WorkflowRevision } from "../schema";

type Correlation = ReturnType<typeof DiagnosticCorrelationSchema.parse>;
export function sampleDiagnosticId(key: string) {
  return `30000000-0000-4000-8000-${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
}

/** Entirely authored exceptions, including fictional file paths and responses. */
export function createSampleDiagnostic(input: {
  key: string;
  type: string;
  message: string;
  occurredAt: string;
  deploymentRef?: string | undefined;
  correlation: Correlation;
  handled?: boolean;
  mechanism?: "span" | "tool" | "report";
  details?: Record<string, unknown>;
}): DiagnosticResponse {
  const timeout = input.type === "ProviderTimeout";
  const malformed = input.type === "CarrierResponseInvalid";
  const transient = input.type === "CarrierUnavailable";
  const limit = input.type === "ExecutionLimitReached";
  const causeType = timeout
    ? "RequestTimeoutError"
    : malformed
      ? "ShipmentSchemaError"
      : transient
        ? "ConnectionResetError"
        : limit
          ? "ToolBudgetExceeded"
          : "ExecutionStreamClosedError";
  const causeMessage = timeout
    ? "The model request exceeded its 12000 ms deadline."
    : malformed
      ? "shipment.state must be a string; received null."
      : transient
        ? "The carrier closed the connection before returning a scan."
        : limit
          ? "No tool-call allowance remained when execution attempted to continue."
          : "The recorded execution stream ended without a terminal response.";
  const file = timeout
    ? "providers/request-model"
    : malformed || transient
      ? "tools/read-parcel"
      : limit
        ? "runtime/execute-specialist"
        : "evals/read-attempt";
  const code = timeout
    ? "SAMPLE_MODEL_TIMEOUT"
    : malformed
      ? "SAMPLE_SHIPMENT_SCHEMA_INVALID"
      : transient
        ? "SAMPLE_CARRIER_UNAVAILABLE"
        : limit
          ? "SAMPLE_TOOL_BUDGET_EXHAUSTED"
          : "EVAL_EXECUTION_UNKNOWN";
  const status = timeout ? 504 : malformed ? 200 : 503;
  const callerFrames =
    input.mechanism === "report"
      ? "    at evaluateCase (sample-support/src/evals/evaluate-case.ts:76:9)\n    at executeSuite (sample-support/src/evals/execute-suite.ts:31:5)"
      : "    at executeWorkflow (sample-support/src/runtime/execute-workflow.ts:76:9)\n    at handleTurn (sample-support/src/http/chat.ts:31:5)";
  const content = redactDiagnosticContent(
    DiagnosticContentSchema.parse({
      schemaVersion: 1,
      data: {
        type: input.type,
        message: input.message,
        code,
        stack: `${input.type}: ${input.message}\n    at execute (sample-support/src/${file}.ts:48:13)\n${callerFrames}`,
        cause: {
          type: causeType,
          message: causeMessage,
          code: timeout ? "ETIMEDOUT" : transient ? "ECONNRESET" : code,
          stack: `${causeType}: ${causeMessage}\n    at readResponse (sample-support/src/${file}.ts:29:11)\n    at execute (sample-support/src/${file}.ts:46:7)`,
          ...(malformed
            ? {
                issues: [
                  {
                    path: ["shipment", "state"],
                    expected: "string",
                    received: "null",
                  },
                ],
              }
            : {}),
        },
        retryable: timeout || transient,
        handled: input.handled ?? false,
        ...(!limit &&
        [
          "ProviderTimeout",
          "CarrierResponseInvalid",
          "CarrierUnavailable",
        ].includes(input.type)
          ? {
              [timeout ? "provider" : "carrier"]: {
                name: timeout ? "openai" : "sample-carrier",
                ...(timeout
                  ? { model: "gpt-4.1-mini", timeoutMs: 12_000 }
                  : {}),
                request: {
                  operation: timeout ? "generateResponse" : "readParcel",
                  headers: {
                    authorization:
                      "synthetic-placeholder-never-a-real-credential",
                  },
                },
                response: {
                  status,
                  headers: {
                    "x-request-id": `sample-request-${input.key.split(":")[0]}`,
                    ...(transient ? { "retry-after": "1" } : {}),
                  },
                  body: malformed
                    ? { shipment: { state: null, estimatedDelivery: 17 } }
                    : { error: { code, message: causeMessage } },
                },
              },
            }
          : {}),
        context: input.correlation,
        details: { source: "authored-sample", ...(input.details ?? {}) },
      },
      capture: { status: "complete", omissions: [], redactions: [] },
    }),
  );
  const bytes = JSON.stringify(content);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const byteLength = Buffer.byteLength(bytes);
  const partCount = Math.ceil(byteLength / DIAGNOSTIC_LIMITS.partBytes);
  return DiagnosticResponseSchema.parse({
    manifest: {
      schemaVersion: 1,
      diagnosticId: sampleDiagnosticId(input.key),
      occurrenceId: sampleDiagnosticId(`occurrence:${input.key}`).replace(
        /^30000000/,
        "40000000",
      ),
      occurredAt: input.occurredAt,
      environment: "sample",
      service: { name: "sample-support", deploymentRef: input.deploymentRef },
      correlation: input.correlation,
      handled: input.handled ?? false,
      severity: input.handled ? "warning" : "error",
      mechanism: input.mechanism ?? "span",
      summary: { type: input.type, message: input.message },
      captureStatus: content.capture.status,
      checksum,
      byteLength,
      partCount,
    },
    state: "available",
    receivedParts: partCount,
    // Sample retention is evaluated against the same frozen clock as its runs.
    expiresAt: new Date(
      Date.parse(SAMPLE_PROJECT.referenceTime) + 30 * 86_400_000,
    ).toISOString(),
    content,
    contentChecksum: checksum,
    contentByteLength: byteLength,
  });
}

export function attachSampleExecutionDiagnostics(
  events: TelemetryEventRecord[],
  revisions: WorkflowRevision[],
) {
  const diagnostics = new Map<string, DiagnosticResponse>();
  for (const event of events) {
    if (
      !["span.failed", "tool.failed", "workflow.call.failed"].includes(
        event.type,
      )
    )
      continue;
    const error =
      event.payload.error && typeof event.payload.error === "object"
        ? (event.payload.error as Record<string, unknown>)
        : undefined;
    const type = String(
      error?.name ?? event.payload.errorType ?? "ExecutionError",
    );
    const message = String(
      error?.message ??
        event.payload.errorMessage ??
        "The synthetic execution failed.",
    );
    const key = `${event.runId}:${type}:${message}`;
    if (!diagnostics.has(key)) {
      const related = events.filter(
        (candidate) => candidate.runId === event.runId,
      );
      const handled = related.some(
        (candidate) =>
          candidate.type === "span.failed" &&
          candidate.payload.handled === true,
      );
      const workflowId =
        event.type === "workflow.call.failed"
          ? String(event.payload.targetWorkflowId)
          : event.workflowId;
      const revision = revisions.find(
        (revision) => revision.workflowId === workflowId,
      );
      const limit = related.find(
        (candidate) => candidate.type === "run.limit_reached",
      );
      const diagnostic = createSampleDiagnostic({
        key,
        type,
        message,
        occurredAt: event.occurredAt.toISOString(),
        deploymentRef: event.deploymentRef ?? undefined,
        handled,
        mechanism: event.type === "tool.failed" ? "tool" : "span",
        correlation: {
          runId: event.runId,
          ...(event.sessionId ? { sessionId: event.sessionId } : {}),
          workflowId,
          nodeId:
            event.type === "workflow.call.failed"
              ? (revision?.nodes[0]?.id ?? "answer")
              : (event.nodeId ?? "answer"),
          ...(revision ? { workflowRevisionId: revision.id } : {}),
          ...(event.traceId ? { traceId: event.traceId } : {}),
          ...(event.spanId ? { spanId: event.spanId } : {}),
          ...(event.parentSpanId ? { parentSpanId: event.parentSpanId } : {}),
          ...Object.fromEntries(
            ["invocationId", "branchId", "toolCallId", "attemptId"].flatMap(
              (field) =>
                typeof event.payload[field] === "string"
                  ? [[field, event.payload[field]]]
                  : [],
            ),
          ),
        },
        details: {
          ...(limit ? { limit: limit.payload } : {}),
          ...(handled
            ? {
                recovery:
                  "One bounded retry succeeded; the parent run completed.",
              }
            : {}),
        },
      });
      diagnostics.set(key, diagnostic);
    }
    const diagnosticId = diagnostics.get(key)?.manifest.diagnosticId;
    event.payload = {
      ...event.payload,
      diagnosticId,
      ...(error ? { error: { ...error, diagnosticId } } : {}),
    };
    if (event.type === "tool.failed")
      ToolObservationSchema.strict().parse(event.payload);
  }
  return [...diagnostics.values()];
}
