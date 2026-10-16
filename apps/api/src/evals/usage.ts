import { classifyUsageError, type UsageFailure } from "@kortyx/usage-telemetry";
import type { EvalWorkerOutcome } from "./worker";

/** Project persisted terminal facts only. Diagnostic content stays in customer storage. */
export function evalOutcomeUsage(value: EvalWorkerOutcome): UsageFailure {
  if (value.cancelled || value.result?.status === "cancelled")
    return { outcome: "cancelled", properties: {} };
  if (value.termination?.code === "EVAL_RUN_TIMEOUT")
    return classifyUsageError({
      code: "EVAL_RUN_TIMEOUT",
      category: "workflow",
      retryable: false,
    });
  if (value.error || value.result?.status === "error") {
    const issue =
      value.issue ??
      value.result?.errors[0] ??
      value.result?.cases.find((item) => item.errors.length)?.errors[0];
    const failure = classifyUsageError(issue);
    return {
      ...failure,
      properties: {
        ...failure.properties,
        ...(issue ? { eval_phase: issue.phase } : {}),
      },
    };
  }
  if (value.result?.status === "failed")
    return { outcome: "quality_failed", properties: {} };
  if (value.result?.status === "ungraded")
    return { outcome: "ungraded", properties: {} };
  if (value.result?.status === "passed")
    return { outcome: "success", properties: {} };
  return {
    outcome: "failed",
    properties: {
      error_code: "UNCLASSIFIED_FAILURE",
      error_category: "unknown",
    },
  };
}
