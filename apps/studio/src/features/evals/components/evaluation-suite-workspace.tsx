"use client";

import type { StudioEvaluationDetail } from "@kortyx/agent/evals";
import { Square } from "lucide-react";
import { parseAsString } from "nuqs";
import { useCallback, useState, useTransition } from "react";
import { usePrepareDetailNavigation } from "@/components/detail/detail-stack";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { detailNavigationHref, useStudioQueryStates } from "@/lib/nuqs";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { studioFeature } from "@/usage/client";
import { evalRequest } from "../api/client";
import { useComparisonQuery } from "../hooks/use-comparison-query";
import { useEvaluationLiveRuns } from "../hooks/use-evaluation-live-runs";
import {
  closedComparisonQuery,
  openComparisonQuery,
} from "../lib/comparison-query";
import {
  type EvaluationChanges,
  evaluationSignature,
} from "../lib/evaluation-changes";
import { evalCaseHref, evaluationHref } from "../lib/navigation";
import {
  caseRows,
  groupCaseRows,
  isActive,
  mixedCaseResults,
} from "../lib/presentation";
import {
  type ConversationTableRow,
  EvalConversationTable,
} from "./eval-case-table";
import { EvalChangeModal } from "./eval-change-modal";
import { EvalDropdown } from "./eval-dropdown";
import { EvalRerunFailed } from "./eval-rerun-failed";
import { EvalRunConfiguration, EvalRunNotices } from "./eval-run-detail";
import { EvalSuiteDetails } from "./eval-suite-details";
import { EvalSuiteNavigation } from "./eval-suite-navigation";
import { EvalSuitePreview } from "./eval-suite-preview";

export function EvaluationSuiteWorkspace({
  evaluation,
  canRun,
  comparison,
}: {
  evaluation: StudioEvaluationDetail;
  canRun: boolean;
  comparison?: EvaluationChanges;
}) {
  const [baselinePending, startTransition] = useTransition();
  const [query, setQuery] = useStudioQueryStates(
    {
      suiteRun: parseAsString,
      evalTab: parseAsString,
      changesSince: parseAsString,
    },
    { shallow: true, startTransition },
  );
  const current = useEvaluationLiveRuns(
    evaluation.id,
    evaluation.suites.map((suite) => suite.id),
  );
  const summary = evaluation.suites.find(
    (suite) => suite.id === query.suiteRun,
  );
  const selectedRun = current.runs.find((run) => run.id === query.suiteRun);
  const visibleComparison =
    comparison?.signature === evaluationSignature(evaluation)
      ? comparison
      : undefined;
  const [, setComparisonQuery] = useComparisonQuery();
  const [navigationKeys, setNavigationKeys] = useState<{
    suiteRun: string | null;
    keys: string[];
  }>();
  const onFilteredRowsChange = useCallback(
    (rows: ConversationTableRow[]) => {
      const keys = rows.map((row) => JSON.stringify([row.suiteId, row.caseId]));
      setNavigationKeys((previous) =>
        previous?.suiteRun === query.suiteRun &&
        JSON.stringify(previous.keys) === JSON.stringify(keys)
          ? previous
          : { suiteRun: query.suiteRun, keys },
      );
    },
    [query.suiteRun],
  );
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const search = useSearchParams();
  const prepare = usePrepareDetailNavigation();
  const select = (id: string | null) => {
    setError("");
    studioFeature("studio.inspect", {
      surface: "evals",
      action: "select",
      tab: "results",
    });
    void setQuery({ suiteRun: id, evalTab: null });
  };
  const cancel = async () => {
    if (!selectedRun || !canRun) return;
    setCancelling(true);
    setError("");
    try {
      await evalRequest(
        `runs/${encodeURIComponent(selectedRun.id)}/cancel`,
        {},
      );
      await current.refresh();
    } catch {
      setError("Could not cancel this suite. Try again.");
    } finally {
      setCancelling(false);
    }
  };
  const rows = current.runs.flatMap((run) => {
    const cases = caseRows(run);
    return groupCaseRows(cases, {
      active: isActive(run.status),
      mixedCases: new Set(mixedCaseResults(run, cases).keys()),
    }).map((row) => ({
      ...row,
      runId: run.id,
      suiteId: run.suiteId,
      suiteName: run.suite.name ?? run.suiteId,
    }));
  });
  const filtered = query.suiteRun
    ? rows.filter((row) => row.runId === query.suiteRun)
    : rows;
  return (
    <div
      className="flex h-full min-h-0 flex-col lg:flex-row"
      data-tour-surface="evaluation-workspace"
    >
      <EvalChangeModal
        comparisons={
          visibleComparison ? { [evaluation.id]: visibleComparison } : {}
        }
        defaultRunId={evaluation.id}
        caseKeys={
          navigationKeys?.suiteRun === query.suiteRun
            ? navigationKeys.keys
            : filtered.map((row) => JSON.stringify([row.suiteId, row.caseId]))
        }
      />
      <EvalSuiteNavigation
        suites={evaluation.suites.map((suite) => ({
          id: suite.id,
          name: suite.suiteName ?? suite.suiteId,
          preview: <EvalSuitePreview suite={suite} />,
          description:
            suite.totalAttempts === undefined
              ? undefined
              : `${suite.completedAttempts ?? 0}/${suite.totalAttempts} results recorded`,
        }))}
        selected={query.suiteRun}
        onSelect={select}
      />
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        data-eval-run-id={summary?.id}
      >
        {error || current.failed.length > 0 ? (
          <p role="alert" className="px-4 py-2 text-xs text-destructive">
            {error ||
              `Could not refresh ${current.failed.length} suite${current.failed.length === 1 ? "" : "s"}. Results may be incomplete or out of date.`}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setError("");
                void current.refresh();
              }}
            >
              Retry
            </Button>
          </p>
        ) : null}
        {query.suiteRun && !summary ? (
          <p role="alert" className="p-4 text-xs">
            This suite is not part of the evaluation.{" "}
            <Button variant="ghost" size="xs" onClick={() => select(null)}>
              All conversations
            </Button>
          </p>
        ) : null}
        {selectedRun ? (
          <div className="empty:hidden px-4 [&:not(:empty)]:py-2">
            <EvalRunNotices run={selectedRun} />
            {selectedRun.cancelRequestedAt && isActive(selectedRun.status) ? (
              <p className="text-xs text-muted-foreground">
                Cancellation requested. Waiting for the application to finish
                cleanup.
              </p>
            ) : null}
          </div>
        ) : null}
        <div
          className="min-h-0 flex-1"
          data-detail-tab-content="cases"
          aria-hidden="false"
          aria-busy={current.loading}
        >
          <EvalConversationTable
            loading={current.loading && !rows.length}
            scope="evaluation"
            onFilteredRowsChange={onFilteredRowsChange}
            comparison={visibleComparison}
            onInspectChange={(change) => {
              if (visibleComparison) {
                studioFeature("studio.inspect", {
                  surface: "evals",
                  action: "compare",
                  tab: "results",
                });
                void setComparisonQuery({
                  ...openComparisonQuery(visibleComparison, [change]),
                  changeCase: change.key,
                });
              }
            }}
            emptyMessage={
              current.loading
                ? "Loading conversations…"
                : current.failed.length
                  ? "Conversation results are unavailable for this view. Retry above."
                  : undefined
            }
            rows={filtered}
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                {comparison?.earlier ? (
                  <EvalDropdown
                    disabled={baselinePending}
                    label="Comparison baseline"
                    value={comparison.earlier.id}
                    triggerLabel="Comparison baseline"
                    contentClassName="w-[28rem]"
                    options={comparison.choices.map((run) => ({
                      value: run.id,
                      label: run.name,
                      description: formatDateTime(run.createdAt),
                    }))}
                    onChange={(id) => {
                      void setComparisonQuery(closedComparisonQuery, {
                        history: "replace",
                      });
                      void setQuery({ changesSince: id }, { shallow: false });
                    }}
                  />
                ) : null}
                {comparison?.state === "error" ? (
                  <span role="alert" className="text-xs text-muted-foreground">
                    {comparison.message}{" "}
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => router.refresh()}
                    >
                      Retry changes
                    </Button>
                  </span>
                ) : null}
                {selectedRun ? (
                  <div className="flex items-center gap-2">
                    <EvalSuiteDetails
                      title={selectedRun.suite.name ?? selectedRun.suiteId}
                      suite={selectedRun.suite}
                      configuration={<EvalRunConfiguration run={selectedRun} />}
                    />
                    <EvalRerunFailed
                      run={selectedRun}
                      canRun={canRun}
                      matchPath={evaluationHref(evaluation.id)}
                    />
                    {canRun && isActive(selectedRun.status) ? (
                      <Button
                        variant="secondary"
                        size="xs"
                        disabled={
                          cancelling || Boolean(selectedRun.cancelRequestedAt)
                        }
                        onClick={() => void cancel()}
                      >
                        <Square />
                        {selectedRun.cancelRequestedAt
                          ? "Cancelling…"
                          : "Cancel suite"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            }
            onCaseChange={(row) => {
              const href = detailNavigationHref(
                evalCaseHref(row.runId, row.caseId, row.defaultRepetition),
                search,
              );
              prepare?.(href);
              router.push(href, { scroll: false });
            }}
          />
        </div>
      </div>
    </div>
  );
}
