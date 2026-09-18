import { errorProperty } from "@kortyx/core/errors";
import type { KortyxTraceErrorProjection } from "./tracing";

/** Internal tracing diagnostics only; never changes client-facing failure contracts. */
export function errorDiagnostics(
  error: unknown,
  project?: KortyxTraceErrorProjection,
): { errorType?: string; errorMessage?: string } {
  try {
    const name =
      errorProperty(error, "name") ??
      (error instanceof Error ? error.name : undefined);
    const message = errorProperty(error, "message");
    const details = project
      ? project(error)
      : {
          type: typeof name === "string" ? name : "Error",
          message:
            typeof error === "string"
              ? error
              : typeof message === "string"
                ? message
                : "Execution reported a fault.",
        };
    if (!details) return {};
    const projectedMessage = details.message;
    const projectedType = details.type;
    if (typeof projectedMessage !== "string") return {};
    return {
      errorMessage: projectedMessage.slice(0, 8192),
      ...(typeof projectedType === "string"
        ? { errorType: projectedType.slice(0, 256) }
        : {}),
    };
  } catch {
    return {};
  }
}
export function isModelTraceSpan(name: string) {
  return name === "runReasonEngine" || name === "useReason";
}
