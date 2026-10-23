"use client";
import { Separator } from "@/components/ui/separator";
import { formatDurationMs } from "@/lib/format";
import type { ChangeSide, ConversationChange } from "../lib/evaluation-changes";
import type { CaseRow, ComparisonRow } from "../lib/presentation";
import {
  EvalAllRepetitionStats,
  EvalComparisonStats,
} from "./eval-comparison-stats";
import { EvalCost, evalCostLabel } from "./eval-cost";
import { EvalDisclosure } from "./eval-disclosure";

export function EvalConversationStats({
  summary,
  row,
  change,
  selectedComparison,
  loading,
  scope,
}: {
  summary: ChangeSide;
  row?: CaseRow;
  change?: ConversationChange;
  selectedComparison?: ComparisonRow;
  loading: boolean;
  scope: string;
}) {
  const moreStats = row ? (
    <EvalDisclosure
      scope={`${scope}-more-stats`}
      label="See more stats"
      expandedLabel="See less stats"
      variant="attached"
    >
      <div className="flex flex-col gap-4 py-3">
        <section
          aria-label="This repetition stats"
          className="flex flex-col gap-3"
        >
          <h4 className="text-xs font-semibold">
            This repetition · {row.repetition}
          </h4>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-xs [&>dt]:text-muted-foreground [&>dd]:text-right [&>dd]:font-mono">
            <dt>Steps recorded</dt>
            <dd>{row.steps.length}</dd>
            <dt>Passed steps</dt>
            <dd>
              {row.steps.filter((step) => step.status === "passed").length}
            </dd>
            <dt>Failed steps</dt>
            <dd>
              {row.steps.filter((step) => step.status === "failed").length}
            </dd>
            <dt>Recorded errors</dt>
            <dd>{row.errors.length}</dd>
            <dt>Execution time</dt>
            <dd>{formatDurationMs(row.durationMs)}</dd>
            <dt>Workflow cost</dt>
            <dd>{evalCostLabel(row.costs?.workflow)}</dd>
            <dt>Judge cost</dt>
            <dd>{evalCostLabel(row.costs?.judge)}</dd>
            <dt>Total cost</dt>
            <dd>
              <EvalCost costs={row.costs} />
            </dd>
          </dl>
          {row.phaseDurationsMs ? (
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-xs [&>dt]:capitalize [&>dt]:text-muted-foreground [&>dd]:text-right [&>dd]:font-mono">
              {Object.entries(row.phaseDurationsMs).map(([phase, ms]) => (
                <div key={phase} className="contents">
                  <dt>{phase}</dt>
                  <dd>{formatDurationMs(ms)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
        <Separator />
        <section
          data-all-repetitions-stats
          aria-label="All repetitions stats"
          className="flex flex-col gap-3"
        >
          <h4 className="text-xs font-semibold">
            All repetitions · {summary.total}
          </h4>
          <EvalAllRepetitionStats summary={summary} change={change} />
        </section>
      </div>
    </EvalDisclosure>
  ) : null;
  return (
    <EvalComparisonStats
      summary={summary}
      row={row}
      change={change}
      selectedComparison={selectedComparison}
      loading={loading}
      section="selected"
      footer={moreStats}
    />
  );
}
