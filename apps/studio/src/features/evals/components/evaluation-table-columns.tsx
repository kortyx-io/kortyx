import type { StudioEvaluationSummary } from "@kortyx/agent/evals";
import { tablePassRate, tableQueueMs } from "@kortyx/telemetry-contracts";
import type { DataTableColumn } from "@/components/data-table";
import { columnFilter } from "@/components/data-table/filter-fields";
import { valueColumn } from "@/components/data-table/value-column";
import { Button } from "@/components/ui/button";
import { evalDurationMs } from "@/features/evals/lib/duration";
import { formatDateTime, formatDurationMs } from "@/lib/format";
import { EvalCost, evalFilterCost } from "./eval-cost";
import { EvalDuration } from "./eval-duration";
import { EvalStatus } from "./eval-status";
export type EvaluationSort = "name" | "created" | "status";
export function createEvaluationColumns(
  onOpen: (run: StudioEvaluationSummary) => void,
): DataTableColumn<StudioEvaluationSummary, EvaluationSort>[] {
  return [
    {
      key: "name",
      filter: [
        columnFilter("name", "Evaluation run", "text", (r) => r.name),
        columnFilter("id", "Evaluation ID", "text", (r) => r.id),
        columnFilter(
          "selection",
          "Suite selection",
          "enum",
          (r) => r.selection,
        ),
        columnFilter("suiteCount", "Suites", "number", (r) => r.suiteCount),
      ],
      label: "Evaluation run",
      sortKey: "name",
      defaultWidth: 260,
      render: (run) => (
        <div>
          <Button
            variant="ghost"
            size="xs"
            className="max-w-full justify-start px-0"
            onClick={() => onOpen(run)}
          >
            <span className="truncate">{run.name}</span>
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {run.legacy
              ? "Previous suite run"
              : run.selection === "all"
                ? "All suites"
                : "Selected suites"}{" "}
            · {run.suiteCount} {run.suiteCount === 1 ? "suite" : "suites"}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      filter: columnFilter("status", "Status", "enum", (r) => r.status),
      label: "Status",
      sortKey: "status",
      defaultWidth: 125,
      render: (run) => <EvalStatus status={run.status} />,
    },
    {
      key: "progress",
      filter: [
        columnFilter(
          "completedSuites",
          "Completed suites",
          "number",
          (r) => r.completedSuites,
        ),
        columnFilter(
          "completedAttempts",
          "Graded attempts",
          "number",
          (r) => r.completedAttempts,
        ),
        columnFilter(
          "totalAttempts",
          "Total attempts",
          "number",
          (r) => r.totalAttempts,
        ),
      ],
      label: "Progress",
      defaultWidth: 200,
      render: (run) => (
        <div className="text-xs">
          <p>
            {run.completedSuites}/{run.suiteCount} suites complete
          </p>
          <p className="text-muted-foreground">
            {run.completedAttempts}/{run.totalAttempts} attempts graded
          </p>
        </div>
      ),
    },
    {
      key: "results",
      filter: [
        columnFilter("passed", "Passed", "number", (r) => r.counts?.passed),
        columnFilter("failed", "Failed", "number", (r) => r.counts?.failed),
        columnFilter("error", "Errors", "number", (r) => r.counts?.error),
        columnFilter(
          "cancelled",
          "Cancelled",
          "number",
          (r) => r.counts?.cancelled,
        ),
      ],
      label: "Results",
      defaultWidth: 230,
      render: (run) => (
        <span className="text-xs">
          {run.counts.passed} passed · {run.counts.failed} failed
          {run.counts.error ? ` · ${run.counts.error} errors` : ""}
          {run.counts.cancelled ? ` · ${run.counts.cancelled} cancelled` : ""}
        </span>
      ),
    },
    {
      key: "application",
      filter: [
        columnFilter(
          "applicationId",
          "Application ID",
          "text",
          (r) => r.targetId,
        ),
        columnFilter("application", "Application", "text", (r) => r.targetName),
        columnFilter(
          "environment",
          "Environment",
          "enum",
          (r) => r.environment,
        ),
      ],
      label: "Application",
      defaultWidth: 180,
      render: (run) => (
        <div className="text-xs">
          <p>{run.targetName}</p>
          <p className="text-muted-foreground">{run.environment}</p>
        </div>
      ),
    },
    {
      key: "trigger",
      filter: [
        columnFilter("trigger", "Trigger", "enum", (r) => r.metadata.source),
        columnFilter("commit", "Commit", "text", (r) => r.metadata.commit),
      ],
      label: "Trigger / Commit",
      defaultWidth: 170,
      render: (run) => (
        <div className="text-xs">
          <p className="capitalize">{run.metadata.source}</p>
          {run.metadata.commit ? (
            <p className="font-mono text-muted-foreground">
              {run.metadata.commit.slice(0, 12)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "created",
      filter: columnFilter("createdAt", "Created", "date", (r) => r.createdAt),
      label: "Created",
      sortKey: "created",
      defaultWidth: 180,
      render: (run) => (
        <span className="font-mono text-[11px]">
          {formatDateTime(run.createdAt)}
        </span>
      ),
    },
    {
      key: "cost",
      filter: columnFilter("cost", "Cost", "number", (r) =>
        evalFilterCost(r.costs),
      ),
      label: "Cost",
      defaultWidth: 100,
      render: (run) => <EvalCost costs={run.costs} />,
    },
    {
      key: "duration",
      filter: columnFilter("duration", "Duration (ms)", "number", (r) =>
        evalDurationMs(r, Date.now()),
      ),
      label: "Duration",
      defaultWidth: 100,
      render: (run) => (
        <span className="font-mono text-xs">
          <EvalDuration run={run} />
        </span>
      ),
    },

    valueColumn<StudioEvaluationSummary, EvaluationSort>({
      key: "judge",
      label: "Judge",
      read: (r) => r.judge?.id,
    }),
    valueColumn<StudioEvaluationSummary, EvaluationSort>({
      key: "judgeVersion",
      label: "Judge version",
      read: (r) => r.judge?.version,
    }),
    valueColumn<StudioEvaluationSummary, EvaluationSort>({
      key: "passRate",
      label: "Pass rate (%)",
      kind: "number",
      read: (r) => tablePassRate(r.counts),
      format: (v) => `${Number(v).toFixed(1)}%`,
    }),
    valueColumn<StudioEvaluationSummary, EvaluationSort>({
      key: "queueMs",
      label: "Queue time (ms)",
      kind: "number",
      read: (r) => tableQueueMs(r.createdAt, r.startedAt),
      format: (v) => formatDurationMs(Number(v)),
    }),
  ];
}
