import { randomUUID } from "node:crypto";
import type {
  KortyxTelemetryConfig,
  KortyxTelemetryEventType,
} from "./tracing";

/** Best effort lifecycle facts. Engine snapshots and interrupt tokens never leave the runtime. */
export function emitWorkflowCall(
  telemetry: KortyxTelemetryConfig | undefined,
  type: KortyxTelemetryEventType,
  payload: Record<string, unknown>,
) {
  const base = telemetry?.correlation;
  if (
    !telemetry?.reporter ||
    !telemetry.environment ||
    !telemetry.service ||
    !base?.runId ||
    !base.workflowId
  )
    return;
  try {
    const active = telemetry.trace?.getActiveContext?.();
    void Promise.resolve(
      telemetry.reporter.emit([
        {
          schemaVersion: 1,
          eventId: randomUUID(),
          occurredAt: new Date().toISOString(),
          environment: telemetry.environment,
          service: telemetry.service,
          correlation: {
            ...base,
            runId: base.runId,
            workflowId: base.workflowId,
            ...active,
          },
          type,
          payload,
        },
      ]),
    ).catch(() => {});
  } catch {
    /* Observability cannot change execution. */
  }
}

export function workflowCallContent(
  telemetry: KortyxTelemetryConfig | undefined,
  side: "input" | "output",
  value: unknown,
): Record<string, unknown> {
  const policy = telemetry?.captureContent;
  if (
    !(policy === true || (policy && typeof policy === "object" && policy[side]))
  )
    return {};
  const serialized = JSON.stringify(value);
  // Use a marker instead of a truncated, misleading JSON result.
  return serialized && Buffer.byteLength(serialized, "utf8") <= 16_384
    ? { [side]: JSON.parse(serialized) }
    : { [`${side}Omitted`]: "Content exceeds 16 KiB" };
}
