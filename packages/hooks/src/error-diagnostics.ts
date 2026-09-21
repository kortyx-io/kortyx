import { errorProperty } from "@kortyx/core/errors";
import type { KortyxErrorDetails, KortyxTraceErrorProjection } from "./tracing";

const MAX_STACK_LENGTH = 32_768;
const MAX_CAUSE_DEPTH = 4;

const projectDetails = (
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): KortyxErrorDetails => {
  const objectValue =
    value && typeof value === "object" ? (value as object) : undefined;
  if (objectValue) {
    if (seen.has(objectValue))
      return { type: "Error", message: "Circular error cause." };
    seen.add(objectValue);
  }
  const name =
    errorProperty(value, "name") ??
    (value instanceof Error ? value.name : undefined);
  const message = errorProperty(value, "message");
  const stack =
    errorProperty(value, "stack") ??
    (value instanceof Error
      ? (() => {
          try {
            return value.stack;
          } catch {
            return undefined;
          }
        })()
      : undefined);
  const cause = depth < MAX_CAUSE_DEPTH ? errorProperty(value, "cause") : null;
  return {
    type: typeof name === "string" ? name.slice(0, 256) : "Error",
    message: (typeof value === "string"
      ? value
      : typeof message === "string"
        ? message
        : "Execution reported a fault."
    ).slice(0, 8192),
    ...(typeof stack === "string"
      ? { stack: stack.slice(0, MAX_STACK_LENGTH) }
      : {}),
    ...(cause !== null && cause !== undefined
      ? { cause: projectDetails(cause, depth + 1, seen) }
      : {}),
  };
};

const sanitizeProjectedDetails = (
  details: KortyxErrorDetails,
  depth = 0,
): KortyxErrorDetails => ({
  ...(typeof details.type === "string"
    ? { type: details.type.slice(0, 256) }
    : {}),
  message:
    typeof details.message === "string"
      ? details.message.slice(0, 8192)
      : "Execution reported a fault.",
  ...(typeof details.stack === "string"
    ? { stack: details.stack.slice(0, MAX_STACK_LENGTH) }
    : {}),
  ...(depth < MAX_CAUSE_DEPTH && details.cause
    ? { cause: sanitizeProjectedDetails(details.cause, depth + 1) }
    : {}),
});

/** Full trusted observer diagnostic; never used for public failure contracts. */
export function exceptionDiagnostics(
  error: unknown,
  project?: KortyxTraceErrorProjection,
): KortyxErrorDetails | null {
  try {
    const details = project
      ? project(error)
      : projectDetails(error, 0, new WeakSet());
    return details ? sanitizeProjectedDetails(details) : null;
  } catch {
    return null;
  }
}

/** Internal tracing diagnostics only; never changes client-facing failure contracts. */
export function errorDiagnostics(
  error: unknown,
  project?: KortyxTraceErrorProjection,
): { errorType?: string; errorMessage?: string } {
  const details = exceptionDiagnostics(error, project);
  return details
    ? {
        errorMessage: details.message,
        ...(details.type ? { errorType: details.type } : {}),
      }
    : {};
}
export function isModelTraceSpan(name: string) {
  return name === "runReasonEngine" || name === "useReason";
}
