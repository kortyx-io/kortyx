"use client";
import { ArrowLeft, GitCompareArrows, Square } from "lucide-react";
import { parseAsStringLiteral } from "nuqs";
import {
  DataTable,
  type DataTableColumn,
  DataTableColumnsMenu,
  DataTableProvider,
} from "@/components/data-table";
import {
  DetailHeader,
  KeyValue,
  Metric,
} from "@/components/detail/detail-primitives";
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
import { EvalPayloadViewer } from "./eval-payload-viewer";
import { EvalStatus } from "./eval-status";

export function EvalRunDetail({
  run,
  onCaseChange,
  onBack,
  onCancel,
  canRun,
  canCompare,
  cancelling,
  onCompare,
}: {
  run: EvalDetail;
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
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <Button variant="ghost" size="xs" onClick={onBack}>
          <ArrowLeft />
          Run history
        </Button>
        <div className="flex gap-2">
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
        </div>
      </div>
      <DetailHeader
        eyebrow="Eval run"
        title={run.suite.name ?? displayName(run.suiteId)}
        status={<EvalStatus status={run.status} />}
        description={`${run.targetName} · ${run.environment} · ${formatDateTime(run.createdAt)}`}
        metrics={
          <>
            <Metric
              label="Completed"
              value={`${counts.completed} / ${counts.total}`}
            />
            <Metric label="Passed" value={counts.passed} />
            <Metric label="Failed" value={counts.failed} />
            <Metric label="Errors" value={counts.error} />
            <Metric label="Cancelled" value={counts.cancelled} />
          </>
        }
        alert={
          run.error ? (
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
          ) : undefined
        }
      />
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
                  <dl>
                    <KeyValue label="Run ID">{run.id}</KeyValue>
                    <KeyValue label="Application">{run.targetName}</KeyValue>
                    <KeyValue label="Environment">{run.environment}</KeyValue>
                    <KeyValue label="Suite revision">
                      {run.suiteRevision}
                    </KeyValue>
                    <KeyValue label="Grader">
                      {run.result?.judge
                        ? `${run.result.judge.id} · ${run.result.judge.version}`
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
                  <EvalPayloadViewer scope="run-definition" value={run.suite} />
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
