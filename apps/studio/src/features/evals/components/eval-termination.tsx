"use client";

import type {
  EvalTermination,
  ResolvedEvalSettings,
} from "@kortyx/agent/evals";
import { parseAsBoolean } from "nuqs";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ErrorNotice } from "@/features/diagnostics/error-notices";
import { formatDurationMs } from "@/lib/format";
import { useStudioQueryState } from "@/lib/nuqs";
import { settingSource } from "./eval-settings-fields";
export function evalTerminationNotice({
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
}): ErrorNotice[] {
  if (!termination) return [];
  return [
    {
      id: termination.diagnosticId ?? "evaluation-termination",
      code: termination.code,
      severity:
        termination.code === "EVAL_RUN_TIMEOUT" ||
        termination.code === "EVAL_CANCELLED"
          ? "warning"
          : "error",
      message: termination.message,
      diagnosticId: termination.diagnosticId,
      summary: `${termination.code === "EVAL_RUN_TIMEOUT" ? `Timed out after ${formatDurationMs(termination.timeoutMs ?? settings?.values.runTimeoutMs ?? 0)}` : termination.code === "EVAL_CANCELLED" ? "Evaluation cancelled" : termination.message}${total !== undefined && completed !== undefined ? ` · ${Math.max(0, total - completed)} unfinished attempts` : ""}`,
      details: (
        <div className="space-y-3 border-t pt-4 text-xs">
          {total !== undefined && completed !== undefined && (
            <p className="mt-2 text-xs">
              {completed} of {total} attempts have recorded outcomes;{" "}
              {Math.max(0, total - completed)} have no recorded outcome.
              {interruptedSuites
                ? ` ${interruptedSuites} suites interrupted.`
                : ""}{" "}
              Completed evidence and grades are preserved.
            </p>
          )}
          {pendingAttempts && (
            <p className="mt-2 text-xs">
              {pendingAttempts.notStarted} not started ·{" "}
              {pendingAttempts.executing} execution outcomes unknown ·{" "}
              {pendingAttempts.awaitingGrading} awaiting grading
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
      ),
    },
  ];
}
export function EvalSettingsSummary({
  settings,
  startedAt,
  children,
}: {
  settings?: ResolvedEvalSettings;
  startedAt?: string | null;
  children?: ReactNode;
}) {
  const [open, setOpen] = useStudioQueryState(
    "runDetails",
    parseAsBoolean.withDefault(false).withOptions({ shallow: true }),
  );
  if (!settings && !children) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        void setOpen(next ? true : null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="xs">
          Run details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] max-w-xl overflow-auto text-xs">
        <DialogTitle className="text-sm font-semibold">Run details</DialogTitle>
        <DialogDescription>
          Execution settings and metadata recorded for this run.
        </DialogDescription>
        {settings && (
          <dl className="mt-3 grid grid-cols-2 gap-2">
            {Object.entries(settings.values).map(([key, value]) => (
              <div key={key}>
                <dt className="text-muted-foreground">
                  {
                    {
                      repetitions: "Repetitions per conversation",
                      concurrency: "Concurrent attempts",
                      caseTimeoutMs: "Case timeout",
                      gradingTimeoutMs: "Grading timeout",
                      runTimeoutMs: "Evaluation timeout",
                      judge: "Judge",
                    }[key]
                  }
                </dt>
                <dd>
                  {key.endsWith("Ms") ? formatDurationMs(Number(value)) : value}{" "}
                  ·{" "}
                  {settingSource(
                    settings.sources[key as keyof typeof settings.sources],
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {startedAt && settings && (
          <p className="mt-2">
            Deadline:{" "}
            {new Date(
              new Date(startedAt).getTime() + settings.values.runTimeoutMs,
            ).toISOString()}
          </p>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
}
