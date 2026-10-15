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
import { DataTable, DataTableProvider } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { FirstObservation } from "@/features/telemetry/components/first-observation";
import { LiveRefreshButton } from "@/features/telemetry/components/live-refresh-button";
import { useLiveRefresh } from "@/features/telemetry/hooks/use-live-refresh";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { evalRequest } from "../api/client";
import { useEvalSetup } from "../hooks/use-eval-setup";
import { evalNavigationHref, evalRunHref } from "../lib/navigation";
import type { EvalTargets } from "../schema";
import { EvalNavigation } from "./eval-navigation";
import { EvalRunSetup } from "./eval-run-setup";
import { createEvaluationColumns } from "./evaluation-table-columns";

export function EvaluationList({
  initialTotalCount,
  initialTargets,
  initialHistory,
  initialError,
}: {
  initialTotalCount: number;
  initialTargets: EvalTargets;
  initialHistory: StudioEvaluationSummary[];
  initialError: string;
}) {
  const [targets, setTargets] = useState(initialTargets);
  const [runs, setRuns] = useState(initialHistory);
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
  const columns = createEvaluationColumns(navigate);
  const _applications = [
    ...new Map([
      ...targets.targets.map((item) => [item.id, item.name] as const),
      ...runs.map((item) => [item.targetId, item.targetName] as const),
    ]),
  ];
  const size = [10, 20, 50, 100].includes(query.pageSize) ? query.pageSize : 20;
  const header = (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <EvalNavigation active="runs" />
        <div className="flex gap-2">
          <LiveRefreshButton
            enabled={query.live}
            status={live.status}
            onToggle={() => {
              void setQuery({ live: !query.live });
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void refresh()}
            aria-label="Refresh evaluations"
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            size="sm"
            disabled={
              !targets.canRun ||
              !targets.targets.some((target) => target.manifest?.suites.length)
            }
            onClick={() => open()}
          >
            <Play className="mr-2 size-3.5" />
            Run evaluations
          </Button>
        </div>
      </div>
    </div>
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
        <DataTableProvider columns={columns}>
          <DataTable
            tableId="evaluations"
            search={{
              label: "Search evaluation runs",
              placeholder: "Search runs, commits or environments…",
              value: query.q,
              onChange: (q) => {
                void setQuery({ q: q || null, cursor: 0 });
              },
            }}
            filterResource="evaluations"
            data={filtered}
            getRowKey={(run) => run.id}
            onRowClick={navigate}
            header={header}
            sort={query.sort}
            direction={query.dir}
            onSort={(sort) => {
              void setQuery({
                sort,
                dir:
                  query.sort === sort && query.dir === "desc" ? "asc" : "desc",
                cursor: 0,
              });
            }}
            emptyState={
              <div className="p-10 text-center">
                <h2 className="text-sm font-medium">
                  {runs.length
                    ? "No evaluations match these filters"
                    : "No evaluation runs yet"}
                </h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  Run all or selected suites to record one evaluation with its
                  suite results.
                </p>
              </div>
            }
            pagination={{
              cursor: Math.min(
                Math.max(0, query.cursor),
                Math.max(0, Math.ceil(totalCount / size) - 1) * size,
              ),
              pageSize: size,
              pageSizes: [10, 20, 50, 100],
              totalCount,
              serverSide: true,
              onCursorChange: (cursor) => {
                void setQuery({ cursor });
              },
              onPageSizeChange: (pageSize) => {
                void setQuery({ pageSize, cursor: 0 });
              },
            }}
          />
        </DataTableProvider>
      </div>
      <EvalRunSetup targets={targets} matchPath="/evals/runs" />
    </div>
  );
}
