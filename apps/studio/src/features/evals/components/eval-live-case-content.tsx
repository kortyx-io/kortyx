"use client";
import type { StudioEvalLiveDetail } from "@kortyx/agent/evals";
import { parseAsInteger } from "nuqs";
import { useState } from "react";
import { DetailHeader } from "@/components/detail/detail-primitives";
import { Button } from "@/components/ui/button";
import { useStudioQueryState } from "@/lib/nuqs";
import { studioFeature } from "@/usage/client";
import { useEvalLiveRun } from "../hooks/use-eval-live-run";
import { useEvalRun } from "../hooks/use-eval-run";
import { caseRows, displayName } from "../lib/presentation";
import type { EvalDetail } from "../schema";
import { EvalCaseContent } from "./eval-case-inspector";
import { EvalDropdown } from "./eval-dropdown";
import { EvalCaseEvidenceSkeleton } from "./eval-evidence-skeleton";
import { EvalJudgeInstructionsLink } from "./eval-judge-instructions-link";
import { EvalStatus } from "./eval-status";
export function EvalLiveCaseContent({
  run,
  caseId,
  repetition,
  fullPage = false,
  initialLive,
}: {
  run: EvalDetail;
  caseId: string;
  repetition: number;
  fullPage?: boolean;
  initialLive: StudioEvalLiveDetail;
}) {
  const [selection, setSelection] = useStudioQueryState(
    "repetition",
    parseAsInteger.withOptions({ shallow: true }),
  );
  const summary = useEvalLiveRun(run.id, initialLive, 0);
  const rows = caseRows(summary.detail ?? initialLive).filter(
    (item) => item.caseId === caseId,
  );
  const selected = rows.some((item) => item.repetition === selection)
    ? (selection ?? repetition)
    : repetition;
  const row = rows.find((item) => item.repetition === selected);
  if (!row) return null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {fullPage ? (
        <DetailHeader
          status={<EvalStatus status={row.status} />}
          eyebrow="Case evaluation"
          title={row.name}
          description={caseId}
        />
      ) : null}
      <div
        className="flex shrink-0 flex-col gap-3 border-b p-4"
        data-tour-surface="eval-repetitions"
      >
        <EvalDropdown
          className="w-full"
          label="Repetition"
          value={String(row.repetition)}
          options={rows.map((item) => ({
            value: String(item.repetition),
            label: `Repetition ${item.repetition} · ${displayName(item.status)}`,
          }))}
          onChange={(value) => {
            studioFeature("studio.inspect", {
              surface: "evals",
              action: "select",
              tab: "results",
            });
            void setSelection(Number(value));
          }}
        />
      </div>
      {summary.error ? (
        <p
          role="alert"
          className="shrink-0 px-4 py-2 text-xs text-red-700 dark:text-red-400"
        >
          {summary.error}
        </p>
      ) : null}
      <div data-tour-surface="eval-case-evidence" className="min-h-0 flex-1">
        <RepetitionEvidence
          key={selected}
          run={run}
          rows={rows}
          caseId={caseId}
          repetition={selected}
          initialRepetition={repetition}
        />
      </div>
    </div>
  );
}

function RepetitionEvidence({
  run,
  rows,
  caseId,
  repetition,
  initialRepetition,
}: {
  run: EvalDetail;
  caseId: string;
  repetition: number;
  initialRepetition: number;
  rows: ReturnType<typeof caseRows>;
}) {
  const [refresh, setRefresh] = useState(0);
  const current = useEvalRun(
    run.id,
    repetition === initialRepetition ? run : null,
    refresh,
    { caseId, repetition },
  );
  const evidence = current.detail
    ? caseRows(current.detail).find(
        (item) => item.caseId === caseId && item.repetition === repetition,
      )
    : undefined;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {current.error ? (
        <div
          role="alert"
          className="flex items-center gap-2 p-4 text-xs text-destructive"
        >
          {current.error}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {evidence ? (
        <EvalCaseContent
          row={evidence}
          repetitions={rows}
          judgeInstructions={
            <EvalJudgeInstructionsLink
              source="run"
              id={run.id}
              context={{ caseId, repetition: String(repetition) }}
            />
          }
        />
      ) : (
        <EvalCaseEvidenceSkeleton />
      )}
    </div>
  );
}
