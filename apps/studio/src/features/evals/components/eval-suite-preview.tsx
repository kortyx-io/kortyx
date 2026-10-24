"use client";

import type { StudioEvalRunSummary } from "@kortyx/agent/evals";
import { tablePassRate, tableQueueMs } from "@kortyx/telemetry-contracts";
import { formatDurationMs } from "@/lib/format";
import { useEvalReferenceTime } from "../hooks/use-eval-reference-time";
import { evalDurationMs } from "../lib/duration";
import { evalCostLabel } from "./eval-cost";
import { EvalStatus } from "./eval-status";
import {
  suiteStatusColors,
  suiteStatusCounts,
  suiteStatusEntries,
  suiteStatusLabels,
} from "./eval-suite-status-bar";

/** Read-only preview: the same saved facts as the run overview table. */
export function EvalSuitePreview({
  suite,
  statusCounts = suiteStatusCounts(suite),
}: {
  suite: StudioEvalRunSummary;
  statusCounts?: Record<string, number>;
}) {
  const referenceTime = useEvalReferenceTime();
  const duration = evalDurationMs(suite, referenceTime ?? Date.now());
  const queue = tableQueueMs(suite.createdAt, suite.startedAt);
  const rate = tablePassRate(suite.counts);
  const facts = [
    ["Workflow cost", evalCostLabel(suite.costs?.workflow)],
    ["Judge cost", evalCostLabel(suite.costs?.judge)],
    ["Total cost", evalCostLabel(suite.costs?.total)],
    [
      "Duration",
      duration === undefined ? "Unavailable" : formatDurationMs(duration),
    ],
    [
      "Pass rate",
      rate === undefined || rate === null
        ? "Not graded"
        : `${rate.toFixed(1)}%`,
    ],
    [
      "Queue time",
      queue === undefined || queue === null
        ? "Not started"
        : formatDurationMs(queue),
    ],
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{suite.suiteName ?? suite.suiteId}</p>
      <EvalStatus status={suite.status} termination={suite.termination} />
      {suite.phase ? (
        <p className="text-xs text-muted-foreground">
          {suite.phase === "grading" ? "Grading" : "Executing"}
        </p>
      ) : null}
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-2 text-xs">
        <dt className="text-muted-foreground">Progress</dt>
        <dd className="text-right tabular-nums">
          {suite.completedAttempts ?? 0} / {suite.totalAttempts ?? 0} recorded
          outcomes
        </dd>
        {suiteStatusEntries(statusCounts).map(([status, count]) => (
          <div key={status} className="contents">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${suiteStatusColors[status] ?? "bg-muted-foreground/30"}`}
              />
              {Object.hasOwn(suiteStatusLabels, status)
                ? suiteStatusLabels[status]
                : status}
            </dt>
            <dd className="text-right tabular-nums">{count}</dd>
          </div>
        ))}
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {!suite.costs?.total.costSummary?.complete &&
      suite.costs?.total.status !== "complete" ? (
        <p className="text-xs text-muted-foreground">
          Costs may be incomplete. A + marks a known subtotal, not a final
          charge.
        </p>
      ) : null}
    </div>
  );
}
