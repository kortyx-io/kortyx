import { randomUUID } from "node:crypto";
import type {
  KortyxTelemetryConfig,
  KortyxTelemetryEvent,
  KortyxTelemetryEventType,
} from "@kortyx/hooks";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const createId = (): string => {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

/** Emits a lifecycle fact only when the application configured telemetry. */
export const emitTelemetryEvent = (args: {
  config: Record<string, unknown>;
  type: KortyxTelemetryEventType;
  payload: Record<string, unknown>;
  correlation?: Partial<KortyxTelemetryEvent["correlation"]> | undefined;
}): void => {
  const telemetry = isRecord(args.config.telemetry)
    ? (args.config.telemetry as KortyxTelemetryConfig)
    : undefined;
  const base = telemetry?.correlation;
  const runId = args.correlation?.runId ?? base?.runId;
  const workflowId = args.correlation?.workflowId ?? base?.workflowId;
  if (
    !telemetry?.reporter ||
    !telemetry.environment ||
    !telemetry.service ||
    !runId ||
    !workflowId
  ) {
    return;
  }
  const context = isRecord(args.config.context) ? args.config.context : {};
  const event: KortyxTelemetryEvent = {
    schemaVersion: 1,
    eventId: createId(),
    occurredAt: new Date().toISOString(),
    environment: telemetry.environment,
    service: telemetry.service,
    correlation: {
      runId,
      workflowId,
      ...(base?.sessionId ? { sessionId: base.sessionId } : {}),
      ...(base?.workflowRevisionId
        ? { workflowRevisionId: base.workflowRevisionId }
        : {}),
      ...(base?.topologyHash ? { topologyHash: base.topologyHash } : {}),
      ...(base?.nodeId ? { nodeId: base.nodeId } : {}),
      ...(args.correlation ?? {}),
    },
    ...(telemetry.metadata ||
    telemetry.tags ||
    context.userId ||
    context.tenantId
      ? {
          context: {
            ...(typeof context.userId === "string"
              ? { userId: context.userId }
              : {}),
            ...(typeof context.tenantId === "string"
              ? { tenantId: context.tenantId }
              : {}),
            ...(telemetry.tags ? { tags: telemetry.tags } : {}),
            ...(telemetry.metadata ? { metadata: telemetry.metadata } : {}),
          },
        }
      : {}),
    type: args.type,
    payload: args.payload,
  };
  try {
    void Promise.resolve(telemetry.reporter.emit([event])).catch(() => {
      // Reporters must not affect the workflow execution path.
    });
  } catch {
    // A custom reporter may violate its async contract. Treat it like a
    // delivery failure rather than allowing observability to break a run.
  }
};
