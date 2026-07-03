import type {
  KortyxTelemetryConfig,
  KortyxTelemetryEvent,
  KortyxTelemetryEventType,
  ReasonTraceAttributes,
  ReasonTraceSpanStartArgs,
} from "@kortyx/hooks";
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

const asErrorPayload = (error: unknown): Record<string, unknown> => ({
  message: error instanceof Error ? error.message : String(error),
  ...(error instanceof Error && error.name ? { name: error.name } : {}),
});

const correlationFrom = (
  attributes: ReasonTraceAttributes | undefined,
  active: ActiveSpan | undefined,
): KortyxTelemetryEvent["correlation"] | undefined => {
  const source = attributes ?? {};
  const runId = stringValue(source.runId) ?? active?.correlation.runId;
  const workflowId =
    stringValue(source.workflowId) ?? active?.correlation.workflowId;
  if (!runId || !workflowId) return undefined;

  const sessionId =
    stringValue(source.sessionId) ?? active?.correlation.sessionId;
  const workflowRevisionId =
    stringValue(source.workflowRevisionId) ??
    active?.correlation.workflowRevisionId;
  const topologyHash =
    stringValue(source.topologyHash) ?? active?.correlation.topologyHash;
  const nodeId = stringValue(source.nodeId) ?? active?.correlation.nodeId;
  return {
    runId,
    workflowId,
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
            ...(args.metadata ? { metadata: args.metadata } : {}),
            ...(input.context ?? {}),
          },
        }
      : {}),
    type: input.type,
    payload: input.payload,
  });

  const spanContext = (
    telemetry: ReasonTraceSpanStartArgs["telemetry"] | undefined,
    attributes: ReasonTraceAttributes,
  ): KortyxTelemetryEvent["context"] | undefined => {
    const tags = [...(args.tags ?? []), ...(telemetry?.tags ?? [])];
    const metadata = {
      ...(args.metadata ?? {}),
      ...(telemetry?.metadata ?? {}),
    };
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
    ...(telemetry?.metadata ? { metadata: telemetry.metadata } : {}),
    ...(telemetry?.prompt
      ? {
          prompt: {
            ...(telemetry.prompt.name ? { name: telemetry.prompt.name } : {}),
            ...(telemetry.prompt.version !== undefined
              ? { version: telemetry.prompt.version }
              : {}),
            ...(telemetry.prompt.type ? { type: telemetry.prompt.type } : {}),
            ...(telemetry.prompt.source
              ? { source: telemetry.prompt.source }
              : {}),
          },
        }
      : {}),
  });

  return {
    asErrorPayload,
    correlationFrom,
    createEvent,
    shouldCapture,
    spanContext,
    stringValue,
    telemetryPayload,
  };
};
