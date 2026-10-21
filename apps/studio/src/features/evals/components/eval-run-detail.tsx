"use client";

import type { StudioEvalLiveDetail } from "@kortyx/agent/evals";
import { GitCompareArrows, Square } from "lucide-react";
import type { ReactNode } from "react";
import { DetailLink } from "@/components/detail/detail-link";
import { KeyValue } from "@/components/detail/detail-primitives";
import { type DetailTab, DetailTabs } from "@/components/detail/detail-tabs";
import { Button } from "@/components/ui/button";
import { ErrorNotices } from "@/features/diagnostics/error-notices";
import { formatDateTime, formatDurationMs } from "@/lib/format";
import {
  caseRows,
  displayName,
  isActive,
  mixedCaseResults,
  progressCounts,
} from "../lib/presentation";
import type { EvalDetail } from "../schema";
import { EvalCaseTable } from "./eval-case-table";
import { EvalCost, EvalCostBreakdown } from "./eval-cost";
import { EvalDetailHeader, EvalSummaryMetric } from "./eval-detail-header";
import { EvalDisclosure } from "./eval-disclosure";
import { EvalDuration } from "./eval-duration";
import { EvalFailure } from "./eval-failure";
import { EvalStatus } from "./eval-status";
import { EvalSuiteDefinition } from "./eval-suite-definition";
import { EvalSettingsSummary, evalTerminationNotice } from "./eval-termination";

export function EvalRunDetail({
  run,
  liveControl,
  rerunControl,
  onCaseChange,
  onBack,
  onCancel,
  canRun,
  canCompare,
  cancelling,
  onCompare,
}: {
  run: EvalDetail | StudioEvalLiveDetail;
  liveControl?: ReactNode;
  rerunControl?: ReactNode;
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
  const notices = <EvalRunNotices run={run} />;
  const tabs: (DetailTab & { id: "cases" | "definition" | "context" })[] = [
    {
      id: "cases",
      label: "Results",
      content: (
        <EvalCaseTable
          active={isActive(run.status)}
          mixedCases={new Set(mixedCaseResults(run, rows).keys())}
          runId={run.id}
          rows={rows}
          onCaseChange={onCaseChange}
        />
      ),
    },
    {
      id: "definition",
      label: "Definition",
      content: (
        <div className="p-4 @lg:p-6">
          <EvalSuiteDefinition scope="run-definition" suite={run.suite} />
        </div>
      ),
    },
    {
      id: "context",
      label: "Configuration",
      content: <EvalRunConfiguration run={run} />,
    },
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
            {rerunControl}
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
            {liveControl}
          </>
        }
      >
        {notices}
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
        <DetailTabs family="eval-run" queryKey="evalTab" tabs={tabs} />
      </div>
    </div>
  );
}

export function EvalRunConfiguration({
  run,
}: {
  run: EvalDetail | StudioEvalLiveDetail;
}) {
  const result = "result" in run ? run.result : null;
  const errors = "errors" in run ? run.errors : (result?.errors ?? []);
  const judge = result?.judge ?? run.request?.judge;
  return (
    <div className="p-4 @lg:p-6">
      <dl
        data-guide-focus="eval-configuration"
        className="[&>div]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>div]:gap-4 [&_dd]:text-right"
      >
        <KeyValue label="Repetitions per conversation">
          {run.resolvedSettings?.values.repetitions ??
            run.request?.repetitions ??
            "Not recorded"}
        </KeyValue>
        <KeyValue label="Concurrency">
          {run.resolvedSettings?.values.concurrency ?? "Not recorded"}
        </KeyValue>
        <KeyValue label="Case timeout">
          {formatDurationMs(run.resolvedSettings?.values.caseTimeoutMs)}
        </KeyValue>
        <KeyValue label="Evaluation timeout">
          {formatDurationMs(run.resolvedSettings?.values.runTimeoutMs)}
        </KeyValue>
        <KeyValue label="Application">{run.targetName}</KeyValue>
        <KeyValue label="Environment">{run.environment}</KeyValue>

        <KeyValue label="Judge location">
          {run.request?.grading ?? judge?.location ?? "Not recorded"}
        </KeyValue>
        <KeyValue label="Grader">
          {judge ? `${judge.id} · ${judge.version}` : "Not recorded"}
        </KeyValue>
      </dl>
      <EvalDisclosure
        scope={`suite-${run.id}-metadata`}
        label="Additional configuration and identifiers"
      >
        <dl>
          <KeyValue label="Run ID">{run.id}</KeyValue>
          <KeyValue label="Suite revision">{run.suiteRevision}</KeyValue>
          <KeyValue label="Started">
            {run.startedAt ? formatDateTime(run.startedAt) : "Not started"}
          </KeyValue>
          <KeyValue label="Ended">
            {run.endedAt ? formatDateTime(run.endedAt) : "In progress"}
          </KeyValue>
          <KeyValue label="Actor / data snapshot">
            Not recorded. Reference facts are available per step.
          </KeyValue>
          <KeyValue label="Prompt versions">
            {run.request?.promptSnapshot ? (
              <div className="space-y-2">
                {Object.values(run.request.promptSnapshot.versions).map(
                  (version) => (
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
                  ),
                )}
                <p className="text-xs text-muted-foreground">
                  Frozen {run.request.promptSnapshot.environment} snapshot
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
        <EvalCostBreakdown costs={run.costs} />
      </EvalDisclosure>
      {errors.map((issue, index) => (
        <EvalFailure
          key={`${index}:${issue.code}`}
          issue={issue}
          environment={run.environment}
          scope={`run-issue-${index}`}
        />
      ))}
    </div>
  );
}

export function EvalRunNotices({
  run,
}: {
  run: EvalDetail | StudioEvalLiveDetail;
}) {
  const rows = caseRows(run);
  const counts = progressCounts(rows);
  const result = "result" in run ? run.result : null;
  const errors = "errors" in run ? run.errors : (result?.errors ?? []);
  const items = [
    ...evalTerminationNotice({
      termination: run.termination,
      settings: run.resolvedSettings,
      completed: counts.completed,
      total: counts.total,
    }),
    ...[
      ...(run.issue && !run.termination ? [run.issue] : []),
      ...errors,
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
  ];
  if (!items.length) return null;
  return <ErrorNotices environment={run.environment} items={items} />;
}
