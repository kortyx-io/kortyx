"use client";
import { DetailHeader } from "@/components/detail/detail-primitives";
import { useEvalRun } from "../hooks/use-eval-run";
import { caseRows } from "../lib/presentation";
import type { EvalDetail } from "../schema";
import { EvalCaseContent } from "./eval-case-inspector";
import { EvalStatus } from "./eval-status";
export function EvalLiveCaseContent({
  run,
  caseId,
  repetition,
  fullPage = false,
}: {
  run: EvalDetail;
  caseId: string;
  repetition: number;
  fullPage?: boolean;
}) {
  const current = useEvalRun(run.id, run, 0);
  const row = caseRows(current.detail ?? run).find(
    (item) => item.caseId === caseId && item.repetition === repetition,
  );
  if (!row) return null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {fullPage ? (
        <DetailHeader
          status={<EvalStatus status={row.status} />}
          eyebrow="Case evaluation"
          title={row.name}
          description={`Attempt ${row.repetition} · ${run.suite.name ?? run.suiteId}`}
        />
      ) : null}
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
