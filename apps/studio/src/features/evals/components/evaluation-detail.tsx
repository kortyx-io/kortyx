"use client";
import {
  type StudioEvalRunSummary,
  type StudioEvaluationDetail,
  StudioEvaluationDetailSchema,
} from "@kortyx/agent/evals";
import { parseAsBoolean } from "nuqs";
import { useCallback, useEffect, useState } from "react";
import {
  DataTable,
  type DataTableColumn,
  DataTableProvider,
} from "@/components/data-table";
import { DetailPage } from "@/components/detail/detail-page";
import { Button } from "@/components/ui/button";
import { LiveRefreshButton } from "@/features/telemetry/components/live-refresh-button";
import { useLiveRefresh } from "@/features/telemetry/hooks/use-live-refresh";
import { formatDateTime } from "@/lib/format";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { evalRequest } from "../api/client";
import { evalNavigationHref, evalRunHref } from "../lib/navigation";
import { isActive } from "../lib/presentation";
import { EvalCost, EvalCostBreakdown } from "./eval-cost";
import { EvalDetailHeader, EvalSummaryMetric } from "./eval-detail-header";
import { EvalDuration } from "./eval-duration";
import { EvalStatus } from "./eval-status";

export function EvaluationDetail({
  id,
  initial,
  canRun,
}: {
  id: string;
  initial: StudioEvaluationDetail | null;
  canRun: boolean;
}) {
  const [run, setRun] = useState(initial);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const router = useRouter();
  const search = useSearchParams();
  const [query, setQuery] = useStudioQueryStates(
    { live: parseAsBoolean.withDefault(true) },
    { shallow: true },
  );
  const read = useCallback(
    async (signal?: AbortSignal) => {
      const next = StudioEvaluationDetailSchema.parse(
        await evalRequest(
          `evaluations/${encodeURIComponent(id)}`,
          undefined,
          signal,
        ),
      );
      if (!signal?.aborted) {
        setRun(next.run);
        setError("");
      }
    },
    [id],
  );
  useEffect(() => {
    const controller = new AbortController();
    void read(controller.signal).catch((cause) => {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load evaluations.",
        );
    });
    return () => controller.abort();
  }, [read]);
  const live = useLiveRefresh({
    enabled: query.live,
    resource: "evals",
    relatedResources: ["runs"],
    refresh: () => read(),
  });
  const navigate = (path: string) =>
    router.push(evalNavigationHref(path, search));
  const cancel = async () => {
    setCancelling(true);
    try {
      await evalRequest(`evaluations/${id}/cancel`, {});
      await read();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not cancel evaluations.",
      );
    } finally {
      setCancelling(false);
    }
  };
  const columns: DataTableColumn<StudioEvalRunSummary>[] = [
    {
      key: "suite",
      label: "Suite",
      defaultWidth: 300,
      render: (suite) => (
        <Button
          variant="ghost"
          size="xs"
          className="max-w-full justify-start px-0"
          onClick={() => navigate(evalRunHref(suite.id))}
        >
          <span className="truncate">{suite.suiteName ?? suite.suiteId}</span>
        </Button>
      ),
    },
    {
      key: "status",
      label: "Status",
      defaultWidth: 150,
      render: (suite) => (
        <div>
          <EvalStatus status={suite.status} />
          {suite.status === "running" && suite.phase ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {suite.phase === "grading" ? "Grading" : "Executing"}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "progress",
      label: "Progress",
      defaultWidth: 180,
      render: (suite) => (
        <span className="text-xs">
          {suite.completedAttempts ?? 0}/{suite.totalAttempts ?? 0} attempts
          graded
        </span>
      ),
    },
    {
      key: "results",
      label: "Results",
      defaultWidth: 260,
      render: (suite) => (
        <div className="text-xs">
          {suite.counts
            ? `${suite.counts.passed} passed · ${suite.counts.failed} failed${suite.counts.error ? ` · ${suite.counts.error} errors` : ""}`
            : isActive(suite.status)
              ? "Awaiting results"
              : "No final summary"}
          {suite.error ? (
            <p className="mt-1 text-red-700 dark:text-red-400">{suite.error}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "cost",
      label: "Cost",
      defaultWidth: 100,
      render: (suite) => <EvalCost costs={suite.costs} />,
    },
    {
      key: "duration",
      label: "Duration",
      defaultWidth: 110,
      render: (suite) => (
        <span className="text-xs">
          <EvalDuration run={suite} />
        </span>
      ),
    },
  ];
  return (
    <DetailPage
      title="Evaluation run"
      description="Suite progress and evaluation results"
    >
      <div className="flex h-full min-h-0 flex-col">
        {error ? (
          <p
            role="alert"
            className="p-3 text-xs text-red-700 dark:text-red-400"
          >
            {error}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                void read().catch((cause) => setError(String(cause)));
              }}
            >
              Retry
            </Button>
          </p>
        ) : null}
        {run ? (
          <>
            <EvalDetailHeader
              title={run.name}
              description={`${run.targetName} · ${run.environment} · ${run.metadata.source}`}
              backLabel="Back to evaluation runs"
              onBack={() => navigate("/evals/runs")}
              actions={
                <>
                  <EvalStatus status={run.status} />
                  <LiveRefreshButton
                    enabled={query.live}
                    status={live.status}
                    onToggle={() => {
                      void setQuery({ live: !query.live });
                    }}
                  />
                  {canRun && isActive(run.status) ? (
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={cancelling || Boolean(run.cancelRequestedAt)}
                      onClick={() => void cancel()}
                    >
                      {run.cancelRequestedAt
                        ? "Cancelling…"
                        : "Cancel remaining work"}
                    </Button>
                  ) : null}
                </>
              }
            >
              <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-md border bg-muted/20 p-3">
                <EvalSummaryMetric
                  label="Suites complete"
                  value={`${run.completedSuites}/${run.suiteCount}`}
                />
                <EvalSummaryMetric
                  label="Attempts graded"
                  value={`${run.completedAttempts}/${run.totalAttempts}`}
                />
                <EvalSummaryMetric label="Passed" value={run.counts.passed} />
                <EvalSummaryMetric label="Failed" value={run.counts.failed} />
                <EvalSummaryMetric label="Errors" value={run.counts.error} />
                <EvalSummaryMetric
                  label="Cancelled"
                  value={run.counts.cancelled}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 pb-2 text-xs text-muted-foreground">
                <span>
                  {run.selection === "all" ? "All suites" : "Selected suites"}
                </span>
                <span>Created {formatDateTime(run.createdAt)}</span>
                {run.startedAt ? (
                  <span>
                    Duration <EvalDuration run={run} />
                  </span>
                ) : null}
                {run.metadata.commit ? (
                  <span className="font-mono">
                    Commit {run.metadata.commit}
                  </span>
                ) : null}
                {run.metadata.deploymentUrl ? (
                  <a
                    className="underline"
                    href={run.metadata.deploymentUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Deployment / CI job
                  </a>
                ) : null}
                <span>
                  Judge {run.judge?.id} · {run.judge?.version}
                </span>
              </div>
              <EvalCostBreakdown costs={run.costs} />
            </EvalDetailHeader>
            <div className="min-h-0 flex-1">
              <DataTableProvider columns={columns}>
                <DataTable
                  className="rounded-none border-0 shadow-none"
                  data={run.suites}
                  getRowKey={(suite) => suite.id}
                  onRowClick={(suite) => navigate(evalRunHref(suite.id))}
                  emptyState={
                    <p className="p-6 text-xs">No suite results available.</p>
                  }
                />
              </DataTableProvider>
            </div>
          </>
        ) : (
          <p className="p-6 text-sm">
            {error
              ? "This evaluation could not be loaded."
              : "Loading evaluations…"}
          </p>
        )}
      </div>
    </DetailPage>
  );
}
