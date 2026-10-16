import type {
  EvalTermination,
  ResolvedEvalSettings,
} from "@kortyx/agent/evals";
import { formatDurationMs } from "@/lib/format";
import { settingSource } from "./eval-settings-fields";
export function EvalTerminationBanner({
  termination,
  settings,
  completed,
  total,
  interruptedSuites,
  pendingAttempts,
}: {
  termination?: EvalTermination | null;
  settings?: ResolvedEvalSettings;
  completed?: number;
  total?: number;
  interruptedSuites?: number;
  pendingAttempts?: {
    notStarted: number;
    executing: number;
    awaitingGrading: number;
  };
}) {
  if (!termination) return null;
  return (
    <div
      role="alert"
      className="mb-3 rounded-lg border border-amber-500/35 bg-amber-500/10 p-4"
    >
      <p className="text-sm font-semibold">
        {termination.code === "EVAL_RUN_TIMEOUT"
          ? `Evaluation timed out after ${formatDurationMs(termination.timeoutMs ?? settings?.values.runTimeoutMs ?? 0)}`
          : "Evaluation interrupted"}
      </p>
      <p className="mt-1 text-sm">{termination.message}</p>
      {total !== undefined && completed !== undefined && (
        <p className="mt-2 text-xs">
          {completed} of {total} attempts have recorded outcomes;{" "}
          {Math.max(0, total - completed)} have no recorded outcome.
          {interruptedSuites ? ` ${interruptedSuites} suites interrupted.` : ""}{" "}
          Completed evidence and grades are preserved.
        </p>
      )}
      {pendingAttempts && (
        <p className="mt-2 text-xs">
          {pendingAttempts.notStarted} not started · {pendingAttempts.executing}{" "}
          execution outcomes unknown · {pendingAttempts.awaitingGrading}{" "}
          awaiting grading
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {termination.phase ? `Phase: ${termination.phase}. ` : ""}
        {termination.timeoutMs
          ? `Evaluation timeout: ${formatDurationMs(termination.timeoutMs)} · ${settingSource(settings?.sources.runTimeoutMs)}. `
          : ""}
        {termination.cleanup === "signalled"
          ? "Cancellation and consumer cleanup were signalled; completion is not confirmed."
          : ""}
      </p>
    </div>
  );
}
export function EvalSettingsSummary({
  settings,
  startedAt,
}: {
  settings?: ResolvedEvalSettings;
  startedAt?: string | null;
}) {
  if (!settings) return null;
  return (
    <details className="mt-3 rounded-md border p-3 text-xs">
      <summary className="cursor-pointer">
        Execution settings · deadline{" "}
        {formatDurationMs(settings.values.runTimeoutMs)}
      </summary>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        {Object.entries(settings.values).map(([key, value]) => (
          <div key={key}>
            <dt className="text-muted-foreground">
              {
                {
                  repetitions: "Attempts per conversation",
                  concurrency: "Concurrent attempts",
                  caseTimeoutMs: "Case timeout",
                  runTimeoutMs: "Evaluation timeout",
                  judge: "Judge",
                }[key]
              }
            </dt>
            <dd>
              {key.endsWith("Ms") ? formatDurationMs(Number(value)) : value} ·{" "}
              {settingSource(
                settings.sources[key as keyof typeof settings.sources],
              )}
            </dd>
          </div>
        ))}
      </dl>
      {startedAt && (
        <p className="mt-2">
          Deadline:{" "}
          {new Date(
            new Date(startedAt).getTime() + settings.values.runTimeoutMs,
          ).toISOString()}
        </p>
      )}
    </details>
  );
}
