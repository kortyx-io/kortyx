"use client";

import {
  StudioEvalTargetsResponseSchema,
  StudioEvaluationHistorySchema,
  type StudioEvaluationSummary,
} from "@kortyx/agent/evals";
import { Play, RefreshCw } from "lucide-react";
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { TablePageHeader } from "@/components/data-table/table-page-header";
import { Button } from "@/components/ui/button";
import { FirstObservation } from "@/features/telemetry/components/first-observation";
import { LiveRefreshButton } from "@/features/telemetry/components/live-refresh-button";
import { useLiveRefresh } from "@/features/telemetry/hooks/use-live-refresh";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { studioHelp } from "@/lib/studio-help";
import { studioFeature } from "@/usage/client";
import { evalRequest } from "../api/client";
import { useComparisonQuery } from "../hooks/use-comparison-query";
import { useEvalReferenceTime } from "../hooks/use-eval-reference-time";
import { useEvalSetup } from "../hooks/use-eval-setup";
import { openComparisonQuery } from "../lib/comparison-query";
import {
  type EvaluationChanges,
  evaluationSignature,
} from "../lib/evaluation-changes";
import { evalNavigationHref, evalRunHref } from "../lib/navigation";
import type { EvalTargets } from "../schema";
import { EvaluationChangeCell } from "./eval-change-cell";
import { EvalChangeModal } from "./eval-change-modal";
import { EvalRunSetup } from "./eval-run-setup";
import { createEvaluationColumns } from "./evaluation-table-columns";

export function EvaluationList({
  initialChanges,
  initialTotalCount,
  initialTargets,
  initialHistory,
  initialError,
}: {
  initialChanges: Record<string, EvaluationChanges>;
  initialTotalCount: number;
  initialTargets: EvalTargets;
  initialHistory: StudioEvaluationSummary[];
  initialError: string;
}) {
  const [targets, setTargets] = useState(initialTargets);
  const [runs, setRuns] = useState(initialHistory);
  const [, setComparisonQuery] = useComparisonQuery();
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  useEffect(() => {
    setRuns(initialHistory);
    setTotalCount(initialTotalCount);
  }, [initialHistory, initialTotalCount]);
  const [error, setError] = useState(initialError);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useStudioQueryStates(
    {
      live: parseAsBoolean.withDefault(true),
      q: parseAsString.withDefault(""),
      application: parseAsString.withDefault("all"),
      status: parseAsString.withDefault("all"),
      sort: parseAsStringLiteral([
        "name",
        "created",
        "status",
      ] as const).withDefault("created"),
      dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc"),
      cursor: parseAsInteger.withDefault(0),
      pageSize: parseAsInteger.withDefault(20),
    },
    { shallow: false },
  );
  const router = useRouter();
  const search = useSearchParams();
  const { open } = useEvalSetup(targets);
  const read = async () => {
    const next = StudioEvaluationHistorySchema.extend({
      totalCount: z.number().int().nonnegative(),
    }).parse(await evalRequest(`evaluations/table?${search.toString()}`));
    setRuns(next.runs);
    setTotalCount(next.totalCount);
    setError("");
    if (
      next.runs.some(
        (run) =>
          !initialChanges[run.id] ||
          initialChanges[run.id].state === "error" ||
          initialChanges[run.id].signature !== evaluationSignature(run),
      )
    )
      router.refresh();
  };
  const refresh = async () => {
    setRefreshing(true);
    try {
      await read();
      setTargets(
        StudioEvalTargetsResponseSchema.parse(await evalRequest("targets")),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not refresh evaluations.",
      );
    } finally {
      setRefreshing(false);
    }
  };
  const live = useLiveRefresh({
    enabled: query.live,
    resource: "evals",
    minRefreshIntervalMs: 1_000,
    refreshOnEnable: false,
    relatedResources: ["runs"],
    refresh: read,
  });
  const navigate = (run: StudioEvaluationSummary) =>
    router.push(
      evalNavigationHref(
        run.legacy ? evalRunHref(run.id) : `/evals/evaluations/${run.id}`,
        search,
      ),
    );
  const filtered = runs;
  const referenceTime = useEvalReferenceTime();
  const baseColumns = createEvaluationColumns(navigate, referenceTime);
  const columns: DataTableColumn<
    StudioEvaluationSummary,
    "name" | "created" | "status"
  >[] = [
    ...baseColumns.slice(0, 4),
    {
      key: "changes",
      label: "Changes",
      defaultWidth: 290,
      filter: false,
      help: studioHelp.evalComparison,
      render: (run) => (
        <EvaluationChangeCell
          comparison={
            initialChanges[run.id]?.signature === evaluationSignature(run)
              ? initialChanges[run.id]
              : undefined
          }
          onInspect={(rows) => {
            const comparison = initialChanges[run.id];
            if (!comparison) return;
            studioFeature("studio.inspect", {
              surface: "evals",
              action: "compare",
              tab: "results",
            });
            void setComparisonQuery(
              openComparisonQuery(comparison, rows, true),
            );
          }}
        />
      ),
    },
    ...baseColumns.slice(4),
  ];
  const header = (
    <TablePageHeader
      help={studioHelp.evals}
      title="Evaluation runs"
      description="Results, costs and changes across saved evaluation runs"
      actions={
        <>
          <LiveRefreshButton
            enabled={query.live}
            status={live.status}
            onToggle={() => {
              void setQuery({ live: !query.live });
            }}
          />
          <Button
            variant="secondary"
            size="icon-sm"
            disabled={refreshing}
            onClick={() => void refresh()}
            aria-label="Refresh evaluations"
          >
            <RefreshCw />
          </Button>
          <Button
            size="sm"
            disabled={
              !targets.canRun ||
              !targets.targets.some((target) => target.manifest?.suites.length)
            }
            onClick={() => open()}
          >
            <Play />
            Run evaluations
          </Button>
        </>
      }
    />
  );
  if (
    !error &&
    targets.targets.length === 0 &&
    runs.length === 0 &&
    !query.q &&
    query.status === "all" &&
    query.application === "all" &&
    !search.get("tableFilters")
  )
    return <FirstObservation resource="evals" />;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {error ? (
        <p
          role="alert"
          className="rounded-md border p-3 text-xs text-red-700 dark:text-red-400"
        >
          {error}
          <Button size="xs" variant="ghost" onClick={() => void refresh()}>
            Retry
          </Button>
        </p>
      ) : null}
      <div className="min-h-0 flex-1">
        <DataTable
          help={{ filters: studioHelp.filters, views: studioHelp.views }}
          query={{
            mode: "remote",
            defaults: { sort: "created" },
          }}
          totalCount={totalCount}
          compatibility={{
            aliases: { status: "status", application: "applicationId" },
          }}
          columns={columns}
          tableId="evaluations"
          search={{
            label: "Search evaluation runs",
            placeholder: "Search runs, commits or environments…",
          }}
          filterResource="evaluations"
          data={filtered}
          getRowKey={(run) => run.id}
          onRowClick={navigate}
          header={header}
          emptyState={({ hasFilters, clearFilters }) => (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <h2 className="text-sm font-medium">
                {hasFilters ||
                query.q ||
                query.status !== "all" ||
                query.application !== "all"
                  ? "No evaluations match these filters"
                  : "No evaluation runs yet"}
              </h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Run all or selected suites to record one evaluation with its
                suite results.
              </p>
              {hasFilters ||
              query.q ||
              query.status !== "all" ||
              query.application !== "all" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    clearFilters();
                    void setQuery({
                      q: "",
                      status: "all",
                      application: "all",
                      cursor: 0,
                    });
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          )}
        />
      </div>
      <EvalChangeModal comparisons={initialChanges} />
      <EvalRunSetup targets={targets} matchPath="/evals/runs" />
    </div>
  );
}
