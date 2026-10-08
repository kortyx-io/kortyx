import type { StudioEvaluationSummary } from "@kortyx/agent/evals";
import type { DataTableColumn } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatDurationMs } from "@/lib/format";
import { EvalCost } from "./eval-cost";
import { EvalStatus } from "./eval-status";
export type EvaluationSort = "name" | "created" | "status";
export function createEvaluationColumns(
  onOpen: (run: StudioEvaluationSummary) => void,
): DataTableColumn<StudioEvaluationSummary, EvaluationSort>[] {
  return [
    {
      key: "name",
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
      label: "Status",
      sortKey: "status",
      defaultWidth: 125,
      render: (run) => <EvalStatus status={run.status} />,
    },
    {
      key: "progress",
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
      label: "Cost",
      defaultWidth: 100,
      render: (run) => <EvalCost costs={run.costs} />,
    },
    {
      key: "duration",
      label: "Duration",
      defaultWidth: 100,
      render: (run) => (
        <span className="font-mono text-xs">
          {run.startedAt && run.endedAt
            ? formatDurationMs(
                Date.parse(run.endedAt) - Date.parse(run.startedAt),
              )
            : "—"}
        </span>
      ),
    },
  ];
}
