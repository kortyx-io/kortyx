import {
  errorProperty,
  isControlFlowError,
  serializeFailure,
} from "@kortyx/core/errors";
import type {
  KortyxTelemetryConfig,
  KortyxTelemetryEvent,
  KortyxTelemetryEventType,
  ReasonTraceAttributes,
  ReasonTraceSpanStartArgs,
} from "@kortyx/hooks";
import {
  exceptionDiagnostics,
  safeTelemetryMetadata,
} from "@kortyx/hooks/internal";
import { summarizeDiagnostic } from "@kortyx/telemetry-contracts";
import type {
  createDiagnosticDelivery,
  DiagnosticCaptureContext,
} from "./diagnostics";
import type { ActiveSpan, SpanContext } from "./types";

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const shouldCapture = (
  value: KortyxTelemetryConfig["captureContent"] | undefined,
  side: "input" | "output",
): boolean => {
  if (value === true) return true;
  return Boolean(value && typeof value === "object" && value[side]);
};

const asErrorPayload = (
  error: unknown,
  project?: import("@kortyx/hooks").KortyxTraceErrorProjection,
  captured?: ReturnType<ReturnType<typeof createDiagnosticDelivery>["capture"]>,
): Record<string, unknown> => {
  if (isControlFlowError(error))
    return {
      name: errorProperty(error, "name"),
      code: errorProperty(error, "code"),
      message: "Execution paused or cancelled.",
      controlFlow: true,
    };
  const failure = serializeFailure(error);
  const diagnostic = captured
    ? captured.details
    : exceptionDiagnostics(error, project);
  const summary = diagnostic ? summarizeDiagnostic(diagnostic) : null;
  const reference = captured
    ? Object.fromEntries(
        Object.entries(captured).filter(([key]) => key !== "details"),
      )
    : {};
  return {
    ...failure,
    name: summary?.type ?? "Error",
    message: summary?.message ?? failure.message,
    ...(summary?.stack ? { stack: summary.stack } : {}),
    ...(summary?.cause ? { cause: summary.cause } : {}),
    ...reference,
  };
};

const correlationFrom = (
  attributes: ReasonTraceAttributes | undefined,
  active: ActiveSpan | undefined,
): KortyxTelemetryEvent["correlation"] | undefined => {
  const source = attributes ?? {};
  const runId = stringValue(source.runId) ?? active?.correlation.runId;
  const workflowId =
    stringValue(source.workflowId) ?? active?.correlation.workflowId;
  if (!runId || !workflowId) return undefined;

  const sameWorkflow = workflowId === active?.correlation.workflowId;
  const sessionId =
    stringValue(source.sessionId) ?? active?.correlation.sessionId;
  const workflowRevisionId =
    stringValue(source.workflowRevisionId) ??
    (sameWorkflow ? active?.correlation.workflowRevisionId : undefined);
  const topologyHash =
    stringValue(source.topologyHash) ??
    (sameWorkflow ? active?.correlation.topologyHash : undefined);
  const nodeId =
    stringValue(source.nodeId) ??
    (sameWorkflow ? active?.correlation.nodeId : undefined);
  return {
    runId,
    workflowId,
    ...Object.fromEntries(
      ["invocationId", "parentInvocationId", "branchId"].flatMap((key) => {
        const value =
          stringValue(source[key]) ??
          active?.correlation[key as "invocationId"];
        return value ? [[key, value]] : [];
      }),
    ),
    ...(sessionId ? { sessionId } : {}),
    ...(workflowRevisionId ? { workflowRevisionId } : {}),
    ...(topologyHash ? { topologyHash } : {}),
    ...(nodeId ? { nodeId } : {}),
  };
};

export const createEventMapper = (args: {
  environment: string;
  service: KortyxTelemetryEvent["service"];
  metadata?: Record<string, unknown> | undefined;
  tags?: string[] | undefined;
  createId: () => string;
  error?: import("@kortyx/hooks").KortyxTraceErrorProjection;
  captureDiagnostic?: ReturnType<typeof createDiagnosticDelivery>["capture"];
}) => {
  const createEvent = (input: {
    type: KortyxTelemetryEventType;
    correlation: KortyxTelemetryEvent["correlation"];
    span?: SpanContext | undefined;
    parentSpanId?: string | undefined;
    payload: Record<string, unknown>;
    context?: KortyxTelemetryEvent["context"] | undefined;
  }): KortyxTelemetryEvent => ({
    schemaVersion: 1,
    eventId: args.createId(),
    occurredAt: new Date().toISOString(),
    environment: args.environment,
    service: args.service,
    correlation: {
      ...input.correlation,
      ...(input.span
        ? { traceId: input.span.traceId, spanId: input.span.spanId }
        : {}),
      ...(input.parentSpanId ? { parentSpanId: input.parentSpanId } : {}),
    },
    ...(input.context || args.metadata || args.tags
      ? {
          context: {
            ...(args.tags ? { tags: args.tags } : {}),
            ...(args.metadata
              ? { metadata: safeTelemetryMetadata(args.metadata) }
              : {}),
            ...(input.context ?? {}),
          },
        }
      : {}),
    type: input.type,
    payload: {
      ...input.payload,
      ...(input.correlation.invocationId
        ? { invocationId: input.correlation.invocationId }
        : {}),
      ...(input.correlation.parentInvocationId
        ? { parentInvocationId: input.correlation.parentInvocationId }
        : {}),
      ...(input.correlation.branchId
        ? { branchId: input.correlation.branchId }
        : {}),
    },
  });

  const spanContext = (
    telemetry: ReasonTraceSpanStartArgs["telemetry"] | undefined,
    attributes: ReasonTraceAttributes,
  ): KortyxTelemetryEvent["context"] | undefined => {
    const tags = [...(args.tags ?? []), ...(telemetry?.tags ?? [])];
    const metadata = safeTelemetryMetadata({
      ...(args.metadata ?? {}),
      ...(telemetry?.metadata ?? {}),
    });
    const userId = stringValue(attributes.userId);
    const tenantId = stringValue(attributes.tenantId);
    return userId || tenantId || tags.length || Object.keys(metadata).length
      ? {
          ...(userId ? { userId } : {}),
          ...(tenantId ? { tenantId } : {}),
          ...(tags.length ? { tags } : {}),
          ...(Object.keys(metadata).length ? { metadata } : {}),
        }
      : undefined;
  };

  const telemetryPayload = (
    telemetry: ReasonTraceSpanStartArgs["telemetry"] | undefined,
  ): Record<string, unknown> => ({
    ...(telemetry?.operation ? { operation: telemetry.operation } : {}),
    ...(telemetry?.tags?.length ? { tags: telemetry.tags } : {}),
    ...(telemetry?.metadata
      ? { metadata: safeTelemetryMetadata(telemetry.metadata) }
      : {}),
    ...(telemetry?.prompt
      ? {
          prompt: {
            ...(telemetry.prompt.name ? { name: telemetry.prompt.name } : {}),
            ...(telemetry.prompt.version !== undefined
              ? { version: telemetry.prompt.version }
              : {}),
            ...(telemetry.prompt.type ? { type: telemetry.prompt.type } : {}),
            ...(telemetry.prompt.metadata &&
            typeof telemetry.prompt.metadata === "object" &&
            !Array.isArray(telemetry.prompt.metadata)
              ? {
                  metadata: safeTelemetryMetadata(
                    telemetry.prompt.metadata as Record<string, unknown>,
                  ),
                }
              : {}),
            ...(telemetry.prompt.source
              ? { source: telemetry.prompt.source }
              : {}),
          },
        }
      : {}),
  });

  return {
    asErrorPayload: (error: unknown, context?: DiagnosticCaptureContext) =>
      asErrorPayload(
        error,
        context?.project ?? args.error,
        context ? args.captureDiagnostic?.(error, context) : undefined,
      ),
    correlationFrom,
    createEvent,
    shouldCapture,
    spanContext,
    stringValue,
    telemetryPayload,
  };
};
