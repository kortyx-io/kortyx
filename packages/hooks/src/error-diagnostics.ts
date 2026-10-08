import { summarizeDiagnostic } from "@kortyx/telemetry-contracts";
import { captureDiagnosticContent } from "./diagnostic-capture";
import type { KortyxErrorDetails, KortyxTraceErrorProjection } from "./tracing";

/** Redacted observer diagnostic; bounded summaries are produced separately. */
export function exceptionDiagnostics(
  error: unknown,
  project?: KortyxTraceErrorProjection,
): KortyxErrorDetails | null {
  const content = captureDiagnosticContent(error, project);
  return !content || content.capture.status === "failed"
    ? null
    : (content.data as KortyxErrorDetails);
}

/** Internal tracing diagnostics only; never changes client-facing failure contracts. */
export function errorDiagnostics(
  error: unknown,
  project?: KortyxTraceErrorProjection,
): { errorType?: string; errorMessage?: string } {
  const captured = exceptionDiagnostics(error, project);
  const details = captured ? summarizeDiagnostic(captured) : null;
  return details
    ? {
        errorMessage: details.message.slice(0, 8192),
        ...(details.type ? { errorType: details.type.slice(0, 256) } : {}),
      }
    : {};
}
export function isModelTraceSpan(name: string) {
  return name === "runReasonEngine" || name === "useReason";
}
