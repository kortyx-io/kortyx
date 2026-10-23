"use client";

import {
  type StudioEvaluationDetail,
  StudioEvaluationDetailSchema,
} from "@kortyx/agent/evals";
import { RefreshCw } from "lucide-react";
import { parseAsBoolean, parseAsString } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { DetailPage } from "@/components/detail/detail-page";
import { Metric } from "@/components/detail/detail-primitives";
import { Button } from "@/components/ui/button";
import {
  type ErrorNotice,
  ErrorNotices,
} from "@/features/diagnostics/error-notices";
import { LiveRefreshButton } from "@/features/telemetry/components/live-refresh-button";
import { useLiveRefresh } from "@/features/telemetry/hooks/use-live-refresh";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { studioHelp } from "@/lib/studio-help";
import { evalRequest } from "../api/client";
import { useEvaluationChanges } from "../hooks/use-evaluation-changes";
import { evalNavigationHref, evalRunHref } from "../lib/navigation";
import { isActive } from "../lib/presentation";
import { EvalCost } from "./eval-cost";
import { EvalDetailHeader } from "./eval-detail-header";
import { EvalEvaluationBodySkeleton } from "./eval-loading";
import { EvalRerunFailed } from "./eval-rerun-failed";
import { EvalStatus } from "./eval-status";
import { evalTerminationNotice } from "./eval-termination";
import { EvaluationRunContext } from "./evaluation-run-context";
import { EvaluationSuiteWorkspace } from "./evaluation-suite-workspace";

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
  const request = useRef<AbortController | null>(null);
  const [comparisonRefresh, setComparisonRefresh] = useState(0);
  const currentId = useRef(id);
  currentId.current = id;
  const router = useRouter();
  const search = useSearchParams();
  const [query, setQuery] = useStudioQueryStates(
    {
      live: parseAsBoolean.withDefault(true),
      suiteRun: parseAsString,
      changesSince: parseAsString,
    },
    { shallow: true },
  );
  const { changes } = useEvaluationChanges(
    run ? [run] : [],
    comparisonRefresh,
    { baseline: query.changesSince, includeChoices: true },
  );
  const comparison = changes[id];
  const read = useCallback(
    async (signal?: AbortSignal) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const activeSignal = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;
      const next = StudioEvaluationDetailSchema.parse(
        await evalRequest(
          `evaluations/${encodeURIComponent(id)}`,
          undefined,
          activeSignal,
        ),
      );
      if (!activeSignal.aborted && currentId.current === id) {
        setRun(next.run);
        setError("");
      }
    },
    [id],
  );
  useEffect(() => {
    setRun(initial);
    const controller = new AbortController();
    if (!initial)
      void read(controller.signal).catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load evaluations.",
          );
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, [read, initial]);
  const live = useLiveRefresh({
    enabled: query.live,
    resource: "evals",
    minRefreshIntervalMs: 5_000,
    refreshOnEnable: false,
    refreshKey: id,
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
  return (
    <DetailPage
      title="Evaluation run"
      description="Suite progress and evaluation results"
    >
      <div data-evaluation-id={id} className="flex h-full min-h-0 flex-col">
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
              help={null}
              description={`${run.targetName} · ${run.environment} · ${run.metadata.source}`}
              backLabel="Back to evaluation runs"
              onBack={() => navigate("/evals/runs")}
              actions={
                <>
                  <EvalStatus
                    status={run.status}
                    termination={run.termination}
                  />
                  <EvalRerunFailed
                    run={run}
                    canRun={canRun}
                    suiteRunId={query.suiteRun}
                  />
                  {canRun && isActive(run.status) ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={cancelling || Boolean(run.cancelRequestedAt)}
                      onClick={() => void cancel()}
                    >
                      {run.cancelRequestedAt
                        ? "Cancelling…"
                        : "Cancel remaining work"}
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    aria-label="Refresh evaluation"
                    onClick={() => {
                      setComparisonRefresh((value) => value + 1);
                      void live.refreshNow();
                    }}
                  >
                    <RefreshCw />
                  </Button>
                  <LiveRefreshButton
                    enabled={query.live}
                    status={live.status}
                    onToggle={() => {
                      void setQuery({ live: !query.live });
                    }}
                  />
                </>
              }
            >
              <ErrorNotices
                environment={run.environment}
                items={[
                  ...evalTerminationNotice({
                    termination: run.termination,
                    settings: run.resolvedSettings,
                    completed: run.completedAttempts,
                    total: run.totalAttempts,
                    interruptedSuites: run.interruptedSuites,
                    pendingAttempts: run.pendingAttempts,
                  }),
                  ...(run.failures ?? [])
                    .filter((failure) => failure.code !== "EVAL_RUN_TIMEOUT")
                    .map(
                      (failure, index): ErrorNotice => ({
                        id:
                          failure.diagnosticId ??
                          `failure-${failure.suiteRunId}-${failure.caseId ?? "suite"}-${failure.repetition ?? 1}-${index}`,
                        severity: "error",
                        code: failure.code,
                        message: failure.message,
                        diagnosticId: failure.diagnosticId,
                        context: `${run.suites.find((suite) => suite.id === failure.suiteRunId)?.suiteName ?? "Suite"} · ${failure.phase}${failure.caseId ? ` · ${failure.caseId} · attempt ${failure.repetition ?? 1}` : ""}`,
                        href: failure.caseId
                          ? `/evals/cases/${failure.suiteRunId}/${encodeURIComponent(failure.caseId)}/${failure.repetition ?? 1}`
                          : evalRunHref(failure.suiteRunId),
                      }),
                    ),
                ]}
              />
              <div
                className="data-table-body-scroll mt-2 flex min-w-0 gap-0 overflow-x-auto rounded-md border bg-muted/20"
                data-tour-surface="evaluation-metrics"
              >
                <Metric
                  label="Suites finished"
                  value={`${run.completedSuites - (run.interruptedSuites ?? 0)}/${run.suiteCount}`}
                  help={studioHelp.evalResults}
                />
                <Metric
                  label="Recorded outcomes"
                  value={`${run.completedAttempts}/${run.totalAttempts}`}
                  help={studioHelp.evalResults}
                />
                <Metric
                  label="Passed"
                  value={run.counts.passed}
                  help={studioHelp.evalResults}
                />
                <Metric
                  label="Failed"
                  value={run.counts.failed}
                  help={studioHelp.evalResults}
                />
                <Metric
                  label="Errors"
                  value={run.counts.error}
                  help={studioHelp.evalResults}
                />
                {Boolean(run.interruptedSuites) && (
                  <Metric
                    label="Suites interrupted"
                    value={run.interruptedSuites ?? 0}
                    help={studioHelp.evalResults}
                  />
                )}
                <Metric
                  label="Cancelled"
                  value={run.counts.cancelled}
                  help={studioHelp.evalResults}
                />
                <Metric
                  label="Total cost"
                  value={<EvalCost costs={run.costs} />}
                  help={studioHelp.evalCost}
                />
                <EvaluationRunContext run={run} />
              </div>
            </EvalDetailHeader>
            <div className="min-h-0 flex-1">
              <EvaluationSuiteWorkspace
                evaluation={run}
                comparison={comparison}
              />
            </div>
          </>
        ) : !error ? (
          <EvalEvaluationBodySkeleton />
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
