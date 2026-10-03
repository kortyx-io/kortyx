"use client";
import { GitCompareArrows, Square } from "lucide-react";
import { parseAsStringLiteral } from "nuqs";
import type { ReactNode } from "react";
import {
  DataTable,
  type DataTableColumn,
  DataTableColumnsMenu,
  DataTableProvider,
} from "@/components/data-table";
import { KeyValue } from "@/components/detail/detail-primitives";
import { DetailTabs } from "@/components/detail/detail-tabs";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatDurationMs } from "@/lib/format";
import { useStudioQueryState } from "@/lib/nuqs";
import {
  type CaseRow,
  caseRows,
  displayName,
  isActive,
  progressCounts,
} from "../lib/presentation";
import type { EvalDetail } from "../schema";
import { EvalCost, EvalCostBreakdown } from "./eval-cost";
import { EvalDetailHeader, EvalSummaryMetric } from "./eval-detail-header";
import { EvalStatus } from "./eval-status";
import { EvalSuiteDefinition } from "./eval-suite-definition";

export function EvalRunDetail({
  run,
  liveControl,
  onCaseChange,
  onBack,
  onCancel,
  canRun,
  canCompare,
  cancelling,
  onCompare,
}: {
  run: EvalDetail;
  liveControl?: ReactNode;
  onCaseChange: (key: string | null) => void;
  onBack: () => void;
  onCancel: () => void;
  canRun: boolean;
  canCompare: boolean;
  cancelling: boolean;
  onCompare: () => void;
}) {
  const rows = caseRows(run);
  const counts = progressCounts(rows);
  const judge = run.result?.judge ?? run.request?.judge;
  const [filter, setFilter] = useStudioQueryState(
    "outcome",
    parseAsStringLiteral(["all", "failed", "error", "passed"] as const)
      .withDefault("all")
      .withOptions({ shallow: true }),
  );
  const columns: DataTableColumn<CaseRow>[] = [
    {
      key: "case",
      label: "Conversation",
      defaultWidth: 320,
      render: (item) => (
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="xs"
            className="max-w-full justify-start px-0 hover:bg-transparent"
            onClick={() => onCaseChange(item.key)}
          >
            <span className="truncate">{item.name}</span>
          </Button>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {item.caseId}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Outcome",
      defaultWidth: 130,
      render: (item) => <EvalStatus status={item.status} />,
    },
    {
      key: "attempt",
      label: "Attempt",
      defaultWidth: 85,
      render: (item) => (
        <span className="font-mono text-xs">{item.repetition}</span>
      ),
    },
    {
      key: "steps",
      label: "Steps",
      defaultWidth: 90,
      render: (item) => (
        <span className="font-mono text-xs">
          {item.steps.length} / {item.expectedSteps}
        </span>
      ),
    },
    {
      key: "cost",
      label: "Cost",
      defaultWidth: 110,
      render: (item) => <EvalCost costs={item.costs} />,
    },
    {
      key: "duration",
      label: "Duration",
      defaultWidth: 100,
      render: (item) => (
        <span className="font-mono text-xs">
          {formatDurationMs(item.durationMs)}
        </span>
      ),
    },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <EvalDetailHeader
        title={run.suite.name ?? displayName(run.suiteId)}
        description={`${run.targetName} · ${run.environment} · ${formatDateTime(run.createdAt)}`}
        backLabel="Run history"
        onBack={onBack}
        actions={
          <>
            {liveControl}
            <EvalStatus status={run.status} />
            <Button
              variant="outline"
              size="xs"
              onClick={onCompare}
              disabled={!canCompare || isActive(run.status)}
            >
              <GitCompareArrows />
              Compare
            </Button>
            {isActive(run.status) && canRun ? (
              <Button
                variant="outline"
                size="xs"
                onClick={onCancel}
                disabled={cancelling || Boolean(run.cancelRequestedAt)}
              >
                <Square />
                {run.cancelRequestedAt ? "Cancelling…" : "Cancel run"}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/20 px-3 py-2">
          <EvalSummaryMetric
            label="Completed"
            value={`${counts.completed} / ${counts.total}`}
          />
          <EvalSummaryMetric label="Passed" value={counts.passed} />
          <EvalSummaryMetric label="Failed" value={counts.failed} />
          <EvalSummaryMetric label="Errors" value={counts.error} />
          <EvalSummaryMetric label="Cancelled" value={counts.cancelled} />
          <span className="flex items-center gap-2 text-xs">
            <EvalCost costs={run.costs} />
            <span className="text-muted-foreground">Cost</span>
          </span>
        </div>
        <div className="empty:hidden [&:not(:empty)]:mt-2">
          {run.error ? (
            <p
              role="alert"
              className="rounded-md border border-red-500/25 bg-red-500/5 p-2 text-xs text-red-700 dark:text-red-400"
            >
              {run.error}
            </p>
          ) : run.cancelRequestedAt && isActive(run.status) ? (
            <p className="text-xs text-muted-foreground">
              Cancellation requested. Waiting for the application to finish
              cleanup.
            </p>
          ) : null}
        </div>
      </EvalDetailHeader>
      <div className="min-h-0 flex-1">
        <DetailTabs
          queryKey="evalTab"
          tabs={[
            {
              id: "cases",
              label: "Case results",
              content: (
                <DataTableProvider columns={columns}>
                  <DataTable
                    data={rows.filter(
                      (r) => filter === "all" || r.status === filter,
                    )}
                    getRowKey={(r) => r.key}
                    onRowClick={(r) => onCaseChange(r.key)}
                    rowClassName={(r) =>
                      r.status === "failed" || r.status === "error"
                        ? "bg-red-500/[0.025]"
                        : undefined
                    }
                    className="rounded-none border-0 shadow-none"
                    header={
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {["all", "failed", "error", "passed"].map((value) => (
                            <Button
                              key={value}
                              variant={filter === value ? "secondary" : "ghost"}
                              size="xs"
                              onClick={() => {
                                void setFilter(
                                  value as
                                    | "all"
                                    | "failed"
                                    | "error"
                                    | "passed",
                                );
                              }}
                            >
                              {value === "all"
                                ? "All attempts"
                                : displayName(value)}
                            </Button>
                          ))}
                        </div>
                        <DataTableColumnsMenu />
                      </div>
                    }
                    emptyState={
                      <p className="p-12 text-center text-sm text-muted-foreground">
                        No attempts match this outcome.
                      </p>
                    }
                  />
                </DataTableProvider>
              ),
            },
            {
              id: "context",
              label: "Configuration",
              content: (
                <div className="p-4 @lg:p-6">
                  <EvalCostBreakdown costs={run.costs} />
                  <dl>
                    <KeyValue label="Run ID">{run.id}</KeyValue>
                    <KeyValue label="Application">{run.targetName}</KeyValue>
                    <KeyValue label="Environment">{run.environment}</KeyValue>
                    <KeyValue label="Suite revision">
                      {run.suiteRevision}
                    </KeyValue>
                    <KeyValue label="Judge location">
                      {run.request?.grading ??
                        judge?.location ??
                        "Not recorded"}
                    </KeyValue>
                    <KeyValue label="Grader">
                      {judge
                        ? `${judge.id} · ${judge.version}`
                        : "Not recorded"}
                    </KeyValue>
                    <KeyValue label="Attempts per case">
                      {run.request?.repetitions ?? "Not recorded"}
                    </KeyValue>
                    <KeyValue label="Started">
                      {run.startedAt
                        ? formatDateTime(run.startedAt)
                        : "Not started"}
                    </KeyValue>
                    <KeyValue label="Ended">
                      {run.endedAt
                        ? formatDateTime(run.endedAt)
                        : "In progress"}
                    </KeyValue>
                    <KeyValue label="Actor / data snapshot">
                      Not recorded. Reference facts are available per step.
                    </KeyValue>
                    <KeyValue label="Prompt version">Not recorded</KeyValue>
                  </dl>
                  {run.result?.errors.map((issue, index) => (
                    <p
                      key={`${index}:${issue.code}`}
                      role="alert"
                      className="mt-3 break-words text-xs text-red-700 dark:text-red-400"
                    >
                      {issue.phase}: {issue.message}
                    </p>
                  ))}
                </div>
              ),
            },
            {
              id: "definition",
              label: "Suite definition",
              content: (
                <div className="p-4 @lg:p-6">
                  <EvalSuiteDefinition
                    scope="run-definition"
                    suite={run.suite}
                  />
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
