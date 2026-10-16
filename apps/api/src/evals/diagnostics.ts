import type {
  DiagnosticContent,
  DiagnosticManifest,
} from "@kortyx/telemetry-contracts";
import type { TelemetryDb } from "@kortyx/telemetry-db";
import { recordErrorDiagnostic } from "../record-error-diagnostic";
import type { EvalWorkerRun } from "./worker";

/** Eval faults are ordinary diagnostic occurrences, with evaluation correlation. */
export function recordEvalDiagnostic(
  db: TelemetryDb,
  run: EvalWorkerRun,
  error: unknown,
  content?: DiagnosticContent,
  correlation: DiagnosticManifest["correlation"] = {},
  severity: "warning" | "error" = "error",
) {
  return recordErrorDiagnostic(db, run, error, {
    ...(content ? { content } : {}),
    severity,
    service: "kortyx-eval-worker",
    correlation: {
      ...(run.evaluationId ? { evaluationId: run.evaluationId } : {}),
      suiteRunId: run.id,
      ...(run.request.attempt
        ? {
            caseId: run.request.attempt.caseId,
            repetition: String(run.request.attempt.repetition),
          }
        : {}),
      ...correlation,
    },
  });
}
