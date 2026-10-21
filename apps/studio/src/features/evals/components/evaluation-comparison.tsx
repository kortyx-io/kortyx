"use client";

import type { StudioEvaluationSummary } from "@kortyx/agent/evals";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import { parseAsString } from "nuqs";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { columnFilter } from "@/components/data-table/filter-fields";
import { DetailLink } from "@/components/detail/detail-link";
import { DetailPage } from "@/components/detail/detail-page";
import { usePrepareDetailNavigation } from "@/components/detail/detail-stack";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "@/components/ui/info-tooltip";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { detailNavigationHref, useStudioQueryStates } from "@/lib/nuqs";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { studioHelp, withStudioColumnHelp } from "@/lib/studio-help";
import { studioFeature } from "@/usage/client";
import { useEvaluationResults } from "../hooks/use-evaluation-results";
import { comparisonMetric } from "../lib/comparison-metrics";
import { sumCaseCosts } from "../lib/cost";
import {
  compareEvaluations,
  type EvaluationComparisonRow,
} from "../lib/evaluation-comparison";
import {
  evalCaseHref,
  evalComparisonCaseHref,
  evaluationCompareHref,
  evaluationHref,
} from "../lib/navigation";
import { displayName, isActive, passLabel } from "../lib/presentation";
import type { EvaluationResults } from "../schema";
import { EvalCost, EvalCostBreakdown, evalFilterCost } from "./eval-cost";
import { EvalDetailHeader } from "./eval-detail-header";
import { EvalDropdown } from "./eval-dropdown";
import { EvalComparisonTableSkeleton } from "./eval-loading";
import { EvalSuiteNavigation } from "./eval-suite-navigation";

export function EvaluationComparison({
  id,
  initialCandidate,
  initialBaseline,
  history,
  historyError,
}: {
  id: string;
  initialCandidate: EvaluationResults | null;
  initialBaseline: EvaluationResults | null;
  history: StudioEvaluationSummary[];
  historyError: boolean;
}) {
  const [query, setQuery] = useStudioQueryStates(
    {
      baseline: parseAsString,
      suiteId: parseAsString,
      change: parseAsString.withDefault("all"),
    },
    { shallow: true },
  );
  const candidate = useEvaluationResults(id, initialCandidate);
  const baseline = useEvaluationResults(query.baseline, initialBaseline);
  const router = useRouter(),
    search = useSearchParams(),
    prepare = usePrepareDetailNavigation();
  const current = candidate.value;
  const rows =
    current && baseline.value
      ? compareEvaluations(baseline.value, current)
      : [];
  const suiteChoices = new Map<string, string>();
  for (const suite of [
    ...(current?.suites ?? []),
    ...(baseline.value?.suites ?? []),
  ])
    if (!suiteChoices.has(suite.suiteId))
      suiteChoices.set(
        suite.suiteId,
        suite.suite.name ?? displayName(suite.suiteId),
      );
  const scoped = query.suiteId
    ? rows.filter((row) => row.suiteId === query.suiteId)
    : rows;
  const filtered = scoped.filter(
    (row) =>
      query.change === "all" ||
      (query.change === "not-comparable"
        ? ["changed", "incomplete"].includes(row.change)
        : row.change === query.change),
  );
  const compatible = history.filter(
    (run) =>
      !run.legacy &&
      !isActive(run.status) &&
      run.targetId === current?.targetId &&
      run.environment === current.environment,
  );
  const choices = compatible.filter((run) => run.id !== id);
  // A directly linked baseline may have aged out of the bounded history list.
  if (baseline.value && !choices.some((run) => run.id === baseline.value?.id))
    choices.push(baseline.value);
  const href = (row: EvaluationComparisonRow) => {
    let path: string;
    if (row.candidateRunId && row.baselineRunId)
      path = evalComparisonCaseHref(
        row.candidateRunId,
        row.id,
        row.baselineRunId,
      );
    else {
      const repetition = row.candidate[0] ?? row.baseline[0];
      path = evalCaseHref(
        row.candidateRunId ?? row.baselineRunId ?? "",
        row.id,
        repetition?.repetition ?? 1,
      );
    }
    return `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams({ evaluationComparison: id, comparisonBaseline: query.baseline ?? "", ...(query.suiteId ? { suiteId: query.suiteId } : {}) })}`;
  };
  const navigateCase = (row: EvaluationComparisonRow) => {
    const path = detailNavigationHref(href(row), search);
    prepare?.(path);
    router.push(path, { scroll: false });
    studioFeature("studio.inspect", {
      surface: "evals",
      action: "inspect",
      tab: "results",
    });
  };
  const columns: DataTableColumn<EvaluationComparisonRow>[] = [
    {
      key: "suite",
      label: "Suite",
      defaultWidth: 180,
      filter: columnFilter("suite", "Suite", "text", (row) => row.suiteName),
      render: (row) => <span className="text-xs">{row.suiteName}</span>,
    },
    {
      key: "case",
      label: "Conversation",
      defaultWidth: 260,
      filter: [
        columnFilter("case", "Conversation", "text", (row) => row.name),
        columnFilter("caseId", "Case ID", "text", (row) => row.id),
      ],
      render: (row) => (
        <Button
          variant="link"
          size="inline"
          className="max-w-full justify-start"
          asChild
        >
          <DetailLink
            href={href(row)}
            onNavigate={() =>
              studioFeature("studio.inspect", {
                surface: "evals",
                action: "inspect",
                tab: "results",
              })
            }
          >
            <span className="truncate">{row.name}</span>
          </DetailLink>
        </Button>
      ),
    },
    {
      key: "baseline",
      label: "Baseline",
      defaultWidth: 145,
      filter: columnFilter(
        "baselineOutcome",
        "Baseline repetition outcome",
        "enum",
        (row) => row.baseline.map((item) => item.status),
      ),
      render: (row) => (
        <span className="text-xs">{passLabel(row.baseline)}</span>
      ),
    },
    {
      key: "candidate",
      label: "Candidate",
      defaultWidth: 145,
      filter: columnFilter(
        "candidateOutcome",
        "Candidate repetition outcome",
        "enum",
        (row) => row.candidate.map((item) => item.status),
      ),
      render: (row) => (
        <span className="text-xs">{passLabel(row.candidate)}</span>
      ),
    },
    {
      key: "change",
      label: "Change",
      defaultWidth: 180,
      help: {
        ...studioHelp.evalComparison,
        description: `${studioHelp.evalComparison.description} Pass-rate changes are shown as the difference in %.`,
      },
      filter: columnFilter("change", "Change", "enum", (row) => row.change),
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span className="text-xs">
            {row.change === "changed"
              ? "Context changed"
              : row.change === "incomplete"
                ? "Not comparable"
                : displayName(row.change)}
          </span>
          <span className="text-xs text-muted-foreground">
            {comparisonMetric(row, "passRate") === undefined
              ? "No score delta"
              : `${(comparisonMetric(row, "passRate") ?? 0) > 0 ? "+" : ""}${comparisonMetric(row, "passRate")?.toFixed(1)} %`}
          </span>
          {row.reason ? (
            <span className="line-clamp-2 text-xs text-muted-foreground">
              {row.reason}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "baselineCost",
      label: "Baseline cost",
      defaultWidth: 125,
      help: studioHelp.evalCost,
      filter: columnFilter(
        "baselineCost",
        "Baseline total cost",
        "number",
        (row) =>
          evalFilterCost(sumCaseCosts(row.baseline.map((item) => item.costs))),
      ),
      render: (row) =>
        row.baseline.length ? (
          <EvalCost
            costs={sumCaseCosts(row.baseline.map((item) => item.costs))}
          />
        ) : (
          <span className="text-xs text-muted-foreground">Not run</span>
        ),
    },
    {
      key: "candidateCost",
      label: "Candidate cost",
      defaultWidth: 125,
      help: studioHelp.evalCost,
      filter: columnFilter(
        "candidateCost",
        "Candidate total cost",
        "number",
        (row) =>
          evalFilterCost(sumCaseCosts(row.candidate.map((item) => item.costs))),
      ),
      render: (row) =>
        row.candidate.length ? (
          <EvalCost
            costs={sumCaseCosts(row.candidate.map((item) => item.costs))}
          />
        ) : (
          <span className="text-xs text-muted-foreground">Not run</span>
        ),
    },
    {
      key: "costDelta",
      label: "Mean cost change",
      defaultWidth: 150,
      help: {
        ...studioHelp.evalCost,
        description:
          "Candidate mean cost per repetition minus baseline mean cost. Only comparable results with complete prices in the same currency have a delta.",
      },
      filter: columnFilter("costDelta", "Mean cost change", "number", (row) =>
        comparisonMetric(row, "cost"),
      ),
      render: (row) => {
        const value = comparisonMetric(row, "cost");
        return (
          <span className="font-mono text-xs">
            {value === undefined
              ? "—"
              : `${value > 0 ? "+" : ""}${formatCurrency(value, { currency: row.candidate[0]?.costs?.total.currency })}`}
          </span>
        );
      },
    },
  ];
  const selectChange = (change: string) => {
    studioFeature("studio.inspect", {
      surface: "evals",
      action: "select",
      tab: "results",
    });
    void setQuery({ change });
  };
  return (
    <DetailPage
      title="Compare evaluation runs"
      description="Suite and conversation differences between saved evaluations"
    >
      <div
        className="flex h-full min-h-0 flex-col"
        data-tour-surface="evaluation-comparison"
      >
        <EvalDetailHeader
          title="Compare evaluation runs"
          description={
            current
              ? `${current.targetName} · ${current.environment}`
              : "Loading saved evaluation"
          }
          backLabel="Evaluation run"
          onBack={() => router.push(evaluationHref(id))}
          actions={
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label="Refresh comparison"
              disabled={candidate.loading || baseline.loading}
              onClick={() => {
                void candidate.retry();
                void baseline.retry();
              }}
            >
              <RefreshCw />
            </Button>
          }
        >
          <div className="grid min-w-0 grid-cols-1 items-start gap-3 pt-2 @2xl:grid-cols-[1fr_auto_1fr]">
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-xs text-muted-foreground">
                Baseline · Compare against
              </span>
              <EvalDropdown
                label="Baseline evaluation"
                value={query.baseline ?? ""}
                triggerLabel={baseline.value?.name}
                className="w-full"
                options={choices.map((run) => ({
                  value: run.id,
                  label: `${run.name} · ${formatDateTime(run.createdAt)}`,
                }))}
                onChange={(value) => {
                  void setQuery({ baseline: value });
                  studioFeature("studio.inspect", {
                    surface: "evals",
                    action: "compare",
                    tab: "results",
                  });
                }}
              />
              {baseline.value ? (
                <EvalCostBreakdown costs={baseline.value.costs} />
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Swap baseline and candidate"
              disabled={!baseline.value}
              onClick={() => {
                if (query.baseline)
                  router.push(evaluationCompareHref(query.baseline, id));
              }}
            >
              <ArrowLeftRight />
            </Button>
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-xs text-muted-foreground">
                Candidate · Change under review
              </span>
              <EvalDropdown
                label="Candidate evaluation"
                value={id}
                triggerLabel={current?.name}
                className="w-full"
                options={[
                  ...(current && !compatible.some((run) => run.id === id)
                    ? [current]
                    : []),
                  ...compatible,
                ]
                  .filter((run) => run.id !== query.baseline)
                  .map((run) => ({
                    value: run.id,
                    label: `${run.name} · ${formatDateTime(run.createdAt)}`,
                  }))}
                onChange={(value) =>
                  router.push(
                    evaluationCompareHref(value, query.baseline ?? undefined),
                  )
                }
              />
              <EvalCostBreakdown costs={current?.costs} />
            </div>
          </div>
          {baseline.value ? (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {(
                [
                  ["regressed", "Regressed"],
                  ["improved", "Improved"],
                  ["unchanged", "Unchanged"],
                  ["not-comparable", "Not comparable"],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  variant="ghost"
                  size="xs"
                  aria-pressed={query.change === key}
                  onClick={() =>
                    selectChange(query.change === key ? "all" : key)
                  }
                >
                  {
                    scoped.filter((row) =>
                      key === "not-comparable"
                        ? ["changed", "incomplete"].includes(row.change)
                        : row.change === key,
                    ).length
                  }{" "}
                  {label}
                </Button>
              ))}
              <HelpCircle help={studioHelp.evalComparison} />
            </div>
          ) : null}
        </EvalDetailHeader>
        {historyError ? (
          <div
            role="alert"
            className="flex items-center gap-2 px-4 py-2 text-xs"
          >
            Evaluation history could not be loaded.
            <Button variant="ghost" size="xs" onClick={() => router.refresh()}>
              Retry
            </Button>
          </div>
        ) : null}
        {candidate.error || baseline.error ? (
          <div
            role="alert"
            className="flex items-center gap-2 px-4 py-2 text-xs text-destructive"
          >
            {candidate.error || baseline.error}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                void candidate.retry();
                void baseline.retry();
              }}
            >
              Retry
            </Button>
          </div>
        ) : null}
        {candidate.loading || baseline.loading ? (
          <div className="min-h-0 flex-1">
            <EvalComparisonTableSkeleton />
          </div>
        ) : !current ? (
          <p className="p-6 text-sm">
            The candidate evaluation is unavailable.
          </p>
        ) : !baseline.value ? (
          <div className="flex flex-col items-start gap-3 p-6">
            <h2 className="text-sm font-medium">
              Choose a baseline evaluation
            </h2>
            <p className="max-w-lg text-sm text-muted-foreground">
              Select a saved evaluation of this application and environment.
              Each conversation appears once, with all its repetitions grouped
              together.
            </p>
            {!choices.length && !historyError ? (
              <p className="text-xs text-muted-foreground">
                No other completed evaluation is available for this application
                and environment yet.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <EvalSuiteNavigation
              overviewLabel="All suites"
              suites={[...suiteChoices].map(([suiteId, name]) => ({
                id: suiteId,
                name,
              }))}
              selected={query.suiteId}
              onSelect={(suiteId) => {
                void setQuery({ suiteId, change: "all" });
              }}
            />
            <div className="min-h-0 min-w-0 flex-1">
              <DataTable
                tableId="evaluation-comparison"
                columns={withStudioColumnHelp(columns, "evals")}
                help={{ filters: studioHelp.filters, views: studioHelp.views }}
                data={filtered}
                getRowKey={(row) => row.key}
                onRowClick={navigateCase}
                rowTone={(row) =>
                  row.change === "regressed" ? "danger" : undefined
                }
                className="rounded-none border-0 shadow-none"
                search={{
                  label: "Search comparison conversations",
                  placeholder: "Search suites or conversations…",
                }}
                toolbarStart={
                  <EvalDropdown
                    label="Show changes"
                    value={query.change}
                    options={[
                      { value: "all", label: "All changes" },
                      { value: "regressed", label: "Regressed" },
                      { value: "improved", label: "Improved" },
                      { value: "unchanged", label: "Unchanged" },
                      { value: "not-comparable", label: "Not comparable" },
                    ]}
                    onChange={selectChange}
                  />
                }
                emptyState={({ hasFilters, clearFilters }) => (
                  <div className="flex flex-col items-center gap-3 p-8">
                    <p className="text-sm text-muted-foreground">
                      No conversations match this comparison view.
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (hasFilters) clearFilters();
                        void setQuery({ change: "all", suiteId: null });
                      }}
                    >
                      Show all conversations
                    </Button>
                  </div>
                )}
              />
            </div>
          </div>
        )}
      </div>
    </DetailPage>
  );
}
