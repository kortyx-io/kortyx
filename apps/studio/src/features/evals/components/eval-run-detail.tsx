"use client";

import { GitCompareArrows, Square } from "lucide-react";
import type { ReactNode } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { columnFilter } from "@/components/data-table/filter-fields";
import { valueColumn } from "@/components/data-table/value-column";
import { DetailLink } from "@/components/detail/detail-link";
import { KeyValue } from "@/components/detail/detail-primitives";
import { DetailTabs } from "@/components/detail/detail-tabs";
import { Button } from "@/components/ui/button";
import { ErrorNotices } from "@/features/diagnostics/error-notices";
import { formatDateTime, formatDurationMs } from "@/lib/format";
import {
  type CaseRow,
  caseRows,
  displayName,
  isActive,
  progressCounts,
} from "../lib/presentation";
import type { EvalDetail } from "../schema";
import { EvalCost, EvalCostBreakdown, evalFilterCost } from "./eval-cost";
import { EvalDetailHeader, EvalSummaryMetric } from "./eval-detail-header";
import { EvalDuration } from "./eval-duration";
import { EvalFailure } from "./eval-failure";
import { EvalStatus } from "./eval-status";
import { EvalSuiteDefinition } from "./eval-suite-definition";
import { EvalSettingsSummary, evalTerminationNotice } from "./eval-termination";

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
  const columns: DataTableColumn<CaseRow>[] = [
    {
      key: "case",
      filter: [
        columnFilter("case", "Conversation", "text", (r) => r.name),
        columnFilter("caseId", "Case ID", "text", (r) => r.caseId),
      ],
      label: "Conversation",
      defaultWidth: 320,
      render: (item) => (
        <div className="min-w-0">
          <Button
            variant="link"
            size="inline"
            className="max-w-full justify-start"
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
      filter: columnFilter("status", "Outcome", "enum", (r) => r.status),
      label: "Outcome",
      defaultWidth: 130,
      render: (item) => <EvalStatus status={item.status} />,
    },
    {
      key: "attempt",
      filter: columnFilter("attempt", "Attempt", "number", (r) => r.repetition),
      label: "Attempt",
      defaultWidth: 85,
      render: (item) => (
        <span className="font-mono text-xs">{item.repetition}</span>
      ),
    },
    {
      key: "steps",
      filter: [
        columnFilter(
          "steps",
          "Completed steps",
          "number",
          (r) => r.steps.length,
        ),
        columnFilter(
          "expectedSteps",
          "Expected steps",
          "number",
          (r) => r.expectedSteps,
        ),
      ],
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
      filter: columnFilter("cost", "Cost", "number", (r) =>
        evalFilterCost(r.costs),
      ),
      label: "Cost",
      defaultWidth: 110,
      render: (item) => <EvalCost costs={item.costs} />,
    },
    {
      key: "duration",
      filter: columnFilter(
        "duration",
        "Duration (ms)",
        "number",
        (r) => r.durationMs,
      ),
      label: "Duration",
      defaultWidth: 100,
      render: (item) => (
        <span className="font-mono text-xs">
          {formatDurationMs(item.durationMs)}
        </span>
      ),
    },

    valueColumn<CaseRow>({
      key: "sessionId",
      label: "Session ID",
      read: (r) => r.sessionId,
    }),
    valueColumn<CaseRow>({
      key: "failure",
      label: "Failure summary",
      read: (r) => [
        ...r.errors.map((error) => error.message),
        ...r.steps
          .filter((step) => step.status === "failed" || step.status === "error")
          .map((step) => step.reason ?? ""),
      ],
    }),
    valueColumn<CaseRow>({
      key: "criteriaScore",
      label: "Criteria passed (%)",
      kind: "number",
      read: (r) => {
        const criteria = r.steps.flatMap((step) => step.criteria);
        return criteria.length
          ? (criteria.filter((item) => item.passed).length / criteria.length) *
              100
          : undefined;
      },
      format: (v) => `${Number(v).toFixed(1)}%`,
    }),
    valueColumn<CaseRow>({
      key: "executionMs",
      label: "Execution time (ms)",
      kind: "number",
      read: (r) => r.phaseDurationsMs?.execute,
      format: (v) => formatDurationMs(Number(v)),
    }),
    valueColumn<CaseRow>({
      key: "gradingMs",
      label: "Judging time (ms)",
      kind: "number",
      read: (r) => r.phaseDurationsMs?.grading,
      format: (v) => formatDurationMs(Number(v)),
    }),
  ];
  return (
    <div data-eval-run-id={run.id} className="flex h-full min-h-0 flex-col">
      <EvalDetailHeader
        title={run.suite.name ?? displayName(run.suiteId)}
        description={`${run.targetName} · ${run.environment} · ${formatDateTime(run.createdAt)}`}
        backLabel={run.evaluationId ? "Evaluation run" : "Run history"}
        onBack={onBack}
        actions={
          <>
            <EvalSettingsSummary
              settings={run.resolvedSettings}
              startedAt={run.startedAt}
            />
            {liveControl}
            <EvalStatus status={run.status} termination={run.termination} />
            <Button
              variant="secondary"
              size="xs"
              onClick={onCompare}
              disabled={!canCompare || isActive(run.status)}
            >
              <GitCompareArrows />
              Compare
            </Button>
            {isActive(run.status) && canRun ? (
              <Button
                variant="secondary"
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
        <ErrorNotices
          environment={run.environment}
          items={[
            ...evalTerminationNotice({
              termination: run.termination,
              settings: run.resolvedSettings,
              completed: counts.completed,
              total: counts.total,
            }),
            ...[
              ...(run.issue && !run.termination ? [run.issue] : []),
              ...(run.result?.errors ?? []),
              ...rows.flatMap((row) => row.errors),
            ]
              .filter((issue) => issue.code !== "EVAL_RUN_TIMEOUT")
              .map((issue, index) => ({
                id: issue.diagnosticId ?? `issue-${index}`,
                severity: "error" as const,
                code: issue.code,
                message: issue.message,
                diagnosticId: issue.diagnosticId,
                exception: issue.exception,
                context: issue.phase,
              })),
            ...(!run.issue && !run.termination && run.error
              ? [
                  {
                    id: "legacy-error",
                    severity: "error" as const,
                    code: "EVAL_EXECUTION_UNKNOWN",
                    message: run.error,
                  },
                ]
              : []),
          ]}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <EvalSummaryMetric
            label="Completed"
            value={`${counts.completed} / ${counts.total}`}
          />
          <EvalSummaryMetric
            label="Duration"
            value={<EvalDuration run={run} />}
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
          {run.cancelRequestedAt && isActive(run.status) ? (
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
                <DataTable
                  compatibility={{ aliases: { outcome: "status" } }}
                  columns={columns}
                  tableId="eval-cases"
                  data={rows}
                  getRowKey={(r) => r.key}
                  onRowClick={(r) => onCaseChange(r.key)}
                  rowTone={(r) =>
                    r.status === "failed" || r.status === "error"
                      ? "danger"
                      : undefined
                  }
                  className="rounded-none border-0 shadow-none"
                  emptyState={
                    <p className="p-12 text-center text-sm text-muted-foreground">
                      No attempts match this outcome.
                    </p>
                  }
                />
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
                    <KeyValue label="Prompt versions">
                      {run.request?.promptSnapshot ? (
                        <div className="space-y-2">
                          {Object.values(
                            run.request.promptSnapshot.versions,
                          ).map((version) => (
                            <div key={version.id}>
                              <DetailLink
                                href={`/prompts/by-key/${version.id.split("/").map(encodeURIComponent).join("/")}?v=${version.version}`}
                                className="font-mono text-xs text-primary hover:underline"
                              >
                                {version.id} · v{version.version}
                              </DetailLink>
                              <p
                                className="max-w-md truncate font-mono text-[10px] text-muted-foreground"
                                title={version.hash}
                              >
                                {version.hash}
                              </p>
                            </div>
                          ))}
                          <p className="text-xs text-muted-foreground">
                            Frozen {run.request.promptSnapshot.environment}{" "}
                            snapshot
                            {run.request.promptGroupName
                              ? ` · ${run.request.promptGroupName}`
                              : ""}
                            . Actual usage is recorded with each test result.
                          </p>
                        </div>
                      ) : (
                        "Not recorded"
                      )}
                    </KeyValue>
                  </dl>
                  {run.result?.errors.map((issue, index) => (
                    <EvalFailure
                      key={`${index}:${issue.code}`}
                      issue={issue}
                      environment={run.environment}
                      scope={`run-issue-${index}`}
                    />
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
