import { getReasonTraceAdapter } from "./context";
import type { ReportErrorOptions } from "./tracing";

/** Reports a handled error to the configured observer without stopping execution. */
export function reportError(
  error: unknown,
  options: ReportErrorOptions = {},
): void {
  try {
    getReasonTraceAdapter()?.reportError?.(error, options);
  } catch {
    // Observability must never participate in workflow execution.
  }
}
