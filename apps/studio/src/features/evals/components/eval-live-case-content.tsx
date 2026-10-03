"use client";
import { useEvalRun } from "../hooks/use-eval-run";
import { caseRows } from "../lib/presentation";
import type { EvalDetail } from "../schema";
import { EvalCaseContent } from "./eval-case-inspector";
export function EvalLiveCaseContent({
  run,
  caseId,
  repetition,
}: {
  run: EvalDetail;
  caseId: string;
  repetition: number;
}) {
  const current = useEvalRun(run.id, run, 0);
  const row = caseRows(current.detail ?? run).find(
    (item) => item.caseId === caseId && item.repetition === repetition,
  );
  if (!row) return null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {current.error ? (
        <p
          role="alert"
          className="shrink-0 px-4 py-2 text-xs text-red-700 dark:text-red-400"
        >
          {current.error}
        </p>
      ) : null}
      <div className="min-h-0 flex-1">
        <EvalCaseContent row={row} />
      </div>
    </div>
  );
}
