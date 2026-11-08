"use client";

import type { EvalSuite } from "@kortyx/agent/evals";
import { tablePassRate } from "@kortyx/telemetry-contracts";
import { FlaskConical, Play, RefreshCw } from "lucide-react";
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { columnFilter } from "@/components/data-table/filter-fields";
import { TablePageHeader } from "@/components/data-table/table-page-header";
import { TableValueFilter } from "@/components/data-table/table-value-filter";
import { valueColumn } from "@/components/data-table/value-column";
import Link from "@/components/scoped-link";
import { Button } from "@/components/ui/button";
import { evalDurationMs } from "@/features/evals/lib/duration";
import { LiveRefreshButton } from "@/features/telemetry/components/live-refresh-button";
import { useLiveRefresh } from "@/features/telemetry/hooks/use-live-refresh";
import type { ListTablePreferences } from "@/features/telemetry/lib/table-preferences";
import { formatDateTime, formatDurationMs } from "@/lib/format";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { studioHelp, withStudioColumnHelp } from "@/lib/studio-help";
import { evalRequest } from "../api/client";
import { useEvalReferenceTime } from "../hooks/use-eval-reference-time";
import { useEvalSetup } from "../hooks/use-eval-setup";
import { evalNavigationHref, evalSuiteHref } from "../lib/navigation";
import { displayName } from "../lib/presentation";
import {
  type EvalHistory,
  EvalHistorySchema,
  type EvalRunSummary,
  type EvalTargets,
  EvalTargetsResponseSchema,
} from "../schema";
import { EvalCost, evalFilterCost } from "./eval-cost";
import { EvalDuration } from "./eval-duration";
import { EvalRunSetup } from "./eval-run-setup";
import { EvalStatus } from "./eval-status";

type SuiteRow = {
  id: string;
  target: EvalTargets["targets"][number];
  suite: EvalSuite;
  latest?: EvalRunSummary;
};
type Sort = "name" | "created" | "status";
const defaults: ListTablePreferences<Sort, unknown> = {
  sort: "created",
  dir: "desc",
  pageSize: 20,
  views: [],
};
const parsers = {
  live: parseAsBoolean.withDefault(true),
  q: parseAsString.withDefault(""),
  env: parseAsString.withDefault("All environments"),
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
};
export function DatasetsPageClient({
  initialTargets,
  initialHistory,
  initialError = "",
  preferences,
}: {
  initialTargets: EvalTargets;
  initialHistory: EvalHistory;
  initialError?: string;
  preferences?: Partial<ListTablePreferences<Sort, unknown>>;
}) {
  const referenceTime = useEvalReferenceTime();
  const [query, setQuery] = useStudioQueryStates(
    {
      ...parsers,
      sort: parsers.sort.withDefault(preferences?.sort ?? defaults.sort),
      dir: parsers.dir.withDefault(preferences?.dir ?? defaults.dir),
      pageSize: parsers.pageSize.withDefault(
        preferences?.pageSize ?? defaults.pageSize,
      ),
    },
    { shallow: true },
  );
  const [targets, setTargets] = useState(initialTargets);
  const [history, setHistory] = useState(initialHistory);
  const [error, setError] = useState(initialError);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { open } = useEvalSetup(targets);
  const update = (values: Partial<typeof query>) => {
    void setQuery(values);
  };
  const refresh = async () => {
    setRefreshing(true);
    setError("");
    const result = await Promise.allSettled([
      evalRequest("targets"),
      evalRequest("runs?latestPerSuite=true"),
    ]);
    try {
      if (result[0].status === "fulfilled")
        setTargets(EvalTargetsResponseSchema.parse(result[0].value));
      if (result[1].status === "fulfilled")
        setHistory(EvalHistorySchema.parse(result[1].value));
      if (result.some((r) => r.status === "rejected"))
        setError(
          "Some eval data could not be refreshed. Saved results remain available; try again.",
        );
    } catch {
      setError(
        "The eval service returned incompatible data. Check the Studio API version.",
      );
    }
    setRefreshing(false);
  };
  const live = useLiveRefresh({
    enabled: query.live,
    resource: "evals",
    minRefreshIntervalMs: 1_000,
    refreshOnEnable: false,
    relatedResources: ["runs"],
    refresh: async () => {
      const value = await evalRequest("runs?latestPerSuite=true");
      setHistory(EvalHistorySchema.parse(value));
    },
  });
  const startSetup = (row?: SuiteRow) => open(row?.target.id, row?.suite.id);
  const chooseSuite = (row: SuiteRow) => {
    const href = evalNavigationHref(
      evalSuiteHref(row.target.id, row.suite.id),
      searchParams,
    );
    router.push(href);
  };
  const suiteRows = targets.targets.flatMap(
    (target) =>
      target.manifest?.suites.map((suite) => ({
        id: evalSuiteHref(target.id, suite.id),
        target,
        suite,
        latest: history.runs.find(
          (run) => run.targetId === target.id && run.suiteId === suite.id,
        ),
      })) ?? [],
  );
  const clearFilters = () =>
    update({
      q: "",
      env: "All environments",
      status: "all",
      application: "all",
      cursor: 0,
    });
  const filtered = Boolean(
    query.q ||
      query.env !== "All environments" ||
      query.status !== "all" ||
      query.application !== "all",
  );
  const suiteColumns: DataTableColumn<SuiteRow, "suite">[] = [
    {
      key: "suite",
      filter: [
        columnFilter(
          "suite",
          "Dataset",
          "text",
          (r) => r.suite.name ?? r.suite.id,
        ),
        columnFilter("suiteId", "Dataset ID", "text", (r) => r.suite.id),
      ],
      label: "Dataset",
      sortKey: "suite",
      defaultWidth: 310,
      render: (r) => (
        <div>
          <Button
            variant="link"
            size="inline"
            className="max-w-full justify-start"
            asChild
          >
            <Link
              href={evalNavigationHref(
                evalSuiteHref(r.target.id, r.suite.id),
                searchParams,
              )}
            >
              <span className="line-clamp-2 whitespace-normal break-words">
                {r.suite.name ?? displayName(r.suite.id)}
              </span>
            </Link>
          </Button>
          <p className="line-clamp-2 whitespace-normal break-words font-mono text-[10px] text-muted-foreground">
            {r.suite.id}
          </p>
        </div>
      ),
    },
    {
      key: "application",
      filter: [
        columnFilter(
          "applicationId",
          "Application ID",
          "text",
          (r) => r.target.id,
        ),
        columnFilter(
          "application",
          "Application",
          "text",
          (r) => r.target.name,
        ),
        columnFilter(
          "environment",
          "Environment",
          "enum",
          (r) => r.target.environment,
        ),
      ],
      label: "Application",
      defaultWidth: 240,
      render: (r) => (
        <div>
          <p className="line-clamp-2 whitespace-normal break-words text-xs">
            {r.target.name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {r.target.environment}
          </p>
        </div>
      ),
    },
    {
      key: "cases",
      filter: columnFilter(
        "cases",
        "Conversations",
        "number",
        (r) => r.suite.cases.length,
      ),
      label: "Conversations",
      defaultWidth: 130,
      render: (r) => (
        <span className="font-mono text-xs">{r.suite.cases.length}</span>
      ),
    },
    {
      key: "latest",
      filter: columnFilter(
        "latest",
        "Latest run",
        "enum",
        (r) => r.latest?.status ?? "never-run",
      ),
      label: "Latest run",
      defaultWidth: 150,
      render: (r) =>
        r.latest ? (
          <EvalStatus
            status={r.latest.status}
            filterField="latest"
            termination={r.latest.termination}
          />
        ) : (
          <TableValueFilter field="latest" value="never-run">
            <span className="text-xs text-muted-foreground">Never run</span>
          </TableValueFilter>
        ),
    },

    {
      ...valueColumn<SuiteRow>({
        key: "latestCost",
        label: "Latest cost",
        kind: "number",
        read: (r) => evalFilterCost(r.latest?.costs),
      }),
      render: (r: SuiteRow) => <EvalCost costs={r.latest?.costs} />,
    },
    valueColumn<SuiteRow>({
      key: "latestAt",
      label: "Latest run date",
      kind: "date",
      read: (r) => r.latest?.createdAt,
      format: (v) => formatDateTime(String(v)),
    }),
    valueColumn<SuiteRow>({
      key: "latestPassRate",
      label: "Latest pass rate (%)",
      kind: "number",
      read: (r) => tablePassRate(r.latest?.counts),
      format: (v) => `${Number(v).toFixed(1)}%`,
    }),
    valueColumn<SuiteRow>({
      key: "latestDuration",
      label: "Latest duration (ms)",
      kind: "number",
      read: (r) =>
        r.latest
          ? evalDurationMs(r.latest, referenceTime ?? Date.now())
          : undefined,
      format: (v) => formatDurationMs(Number(v)),
    }),
    {
      key: "run",
      filter: false,
      label: "Execute",
      defaultWidth: 110,
      render: (r) => (
        <Button
          variant="secondary"
          size="xs"
          disabled={!targets.canRun}
          onClick={(event) => {
            event.stopPropagation();
            startSetup(r);
          }}
        >
          <Play />
          Run
        </Button>
      ),
    },
  ];
  const header = (
    <TablePageHeader
      help={studioHelp.datasets}
      title="Datasets"
      description="Browse code-managed datasets and their conversation definitions"
      actions={
        <>
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="Refresh datasets"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
          </Button>
          <Button
            size="sm"
            disabled={!targets.canRun || !targets.targets.length}
            onClick={() => startSetup()}
          >
            <Play />
            Run experiment
          </Button>
          <LiveRefreshButton
            enabled={query.live}
            status={live.status}
            onToggle={() => update({ live: !query.live })}
          />
        </>
      }
    >
      {targets.targets.some((t) => t.error) ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {targets.targets.filter((t) => t.error).length} application connection
          unavailable. Saved results can still be inspected.
        </p>
      ) : null}
    </TablePageHeader>
  );
  const empty = (
    <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
      <FlaskConical className="mb-3 size-7 text-muted-foreground" />
      <h2 className="font-medium">
        {filtered ? "No datasets match these filters" : "No datasets available"}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "Change your search or clear the filters."
          : targets.targets.length
            ? "Reconnect the application and refresh to discover its registered datasets."
            : "Connect an application eval endpoint in your Studio API configuration."}
      </p>
      {filtered ? (
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={clearFilters}
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  );
  if (
    !error &&
    !filtered &&
    targets.targets.length === 0 &&
    history.runs.length === 0
  )
    return <FirstObservation resource="evals" />;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {error ? (
        <div
          role="alert"
          className="flex shrink-0 items-start justify-between gap-2 rounded-md border border-red-500/25 bg-red-500/5 px-4 py-2 text-xs text-red-700 dark:text-red-400"
        >
          <span>{error}</span>
          <Button variant="ghost" size="xs" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <DataTable
          help={{ filters: studioHelp.filters, views: studioHelp.views }}
          query={{
            keys: {
              q: "q",
              sort: "sort",
              dir: "dir",
              cursor: "cursor",
              pageSize: "pageSize",
            },
            defaults: {
              sort: "suite",
              dir: preferences?.dir ?? "desc",
              pageSize: preferences?.pageSize ?? 20,
            },
          }}
          compatibility={{
            aliases: {
              status: "status",
              application: "applicationId",
              env: "environment",
            },
            ignoreValues: ["all", "All environments"],
          }}
          columns={withStudioColumnHelp(suiteColumns, "evals")}
          tableId="eval-suites"
          search={{
            label: "Search datasets",
            placeholder: "Search datasets…",
          }}
          data={suiteRows}
          getRowKey={(r) => r.id}
          onRowClick={(r) => chooseSuite(r)}
          header={header}
          emptyState={empty}
        />
      </div>
      <EvalRunSetup targets={targets} matchPath="/datasets" />
    </div>
  );
}

import { FirstObservation } from "@/features/telemetry/components/first-observation";
