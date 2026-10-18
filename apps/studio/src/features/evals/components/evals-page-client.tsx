"use client";

import type { EvalSuite } from "@kortyx/agent/evals";
import { tablePassRate } from "@kortyx/telemetry-contracts";
import { FlaskConical, GitCompareArrows, Play, RefreshCw } from "lucide-react";
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { columnFilter } from "@/components/data-table/filter-fields";
import { TablePageHeader } from "@/components/data-table/table-page-header";
import { valueColumn } from "@/components/data-table/value-column";
import { DetailLink } from "@/components/detail/detail-link";
import { usePrepareDetailNavigation } from "@/components/detail/detail-stack";
import { Button } from "@/components/ui/button";
import { evalDurationMs } from "@/features/evals/lib/duration";
import { LiveRefreshButton } from "@/features/telemetry/components/live-refresh-button";
import { useLiveRefresh } from "@/features/telemetry/hooks/use-live-refresh";
import type { ListTablePreferences } from "@/features/telemetry/lib/table-preferences";
import { formatDateTime, formatDurationMs } from "@/lib/format";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { evalRequest } from "../api/client";
import { useEvalReferenceTime } from "../hooks/use-eval-reference-time";
import { useEvalSetup } from "../hooks/use-eval-setup";
import {
  evalCompareHref,
  evalNavigationHref,
  evalRunHref,
  evalSuiteHref,
} from "../lib/navigation";
import { displayName, isActive } from "../lib/presentation";
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
  selected: parseAsArrayOf(parseAsString).withDefault([]),
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
export function EvalsPageClient({
  initialTargets,
  initialHistory,
  view,
  initialError = "",
  preferences,
}: {
  initialTargets: EvalTargets;
  initialHistory: EvalHistory;
  view: "runs" | "suites";
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
  const selectedRuns = query.selected;
  const setSelectedRuns = (next: string[]) => {
    void setQuery({ selected: next });
  };
  const navigate = (href: string) =>
    router.push(evalNavigationHref(href, searchParams));
  const update = (values: Partial<typeof query>) => {
    void setQuery(values);
  };
  const refresh = async () => {
    setRefreshing(true);
    setError("");
    const result = await Promise.allSettled([
      evalRequest("targets"),
      evalRequest(view === "suites" ? "runs?latestPerSuite=true" : "runs"),
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
    relatedResources: ["runs"],
    refresh: async () => {
      const value = await evalRequest(
        view === "suites" ? "runs?latestPerSuite=true" : "runs",
      );
      setHistory(EvalHistorySchema.parse(value));
    },
  });
  const startSetup = (row?: SuiteRow) => open(row?.target.id, row?.suite.id);
  const prepareDetailNavigation = usePrepareDetailNavigation();
  const chooseSuite = (row: SuiteRow) => {
    const href = evalNavigationHref(
      evalSuiteHref(row.target.id, row.suite.id),
      searchParams,
    );
    prepareDetailNavigation?.(href);
    router.push(href);
  };
  const suiteRows = targets.targets.flatMap(
    (target) =>
      target.manifest?.suites.map((suite) => ({
        id: `${target.id}:${suite.id}`,
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
  const chooseRun = (id: string) => navigate(evalRunHref(id));
  const runColumns: DataTableColumn<EvalRunSummary, Sort>[] = [
    {
      key: "select",
      filter: false,
      label: "Compare",
      defaultWidth: 70,
      render: (r) => (
        <input
          type="checkbox"
          aria-label={`Select ${r.id} for comparison`}
          className="accent-foreground"
          checked={selectedRuns.includes(r.id)}
          disabled={
            isActive(r.status) ||
            (!selectedRuns.includes(r.id) && selectedRuns.length === 2)
          }
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            setSelectedRuns(
              e.target.checked
                ? [...selectedRuns, r.id]
                : selectedRuns.filter((id) => id !== r.id),
            )
          }
        />
      ),
    },
    {
      key: "suite",
      filter: [
        columnFilter("suite", "Suite", "text", (r) => r.suiteName ?? r.suiteId),
        columnFilter("id", "Run ID", "text", (r) => r.id),
      ],
      label: "Suite",
      sortKey: "name",
      defaultWidth: 260,
      render: (r) => (
        <div>
          <Button
            variant="link"
            size="inline"
            onClick={() => chooseRun(r.id)}
            className="max-w-full justify-start"
          >
            <span className="truncate">
              {r.suiteName ?? displayName(r.suiteId)}
            </span>
          </Button>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {r.id.slice(0, 8)}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      filter: columnFilter("status", "Status", "enum", (r) => r.status),
      label: "Status",
      sortKey: "status",
      defaultWidth: 135,
      render: (r) => (
        <EvalStatus status={r.status} termination={r.termination} />
      ),
    },
    {
      key: "results",
      filter: [
        columnFilter("passed", "Passed", "number", (r) => r.counts?.passed),
        columnFilter("failed", "Failed", "number", (r) => r.counts?.failed),
        columnFilter("error", "Errors", "number", (r) => r.counts?.error),
        columnFilter(
          "cancelled",
          "Cancelled",
          "number",
          (r) => r.counts?.cancelled,
        ),
      ],
      label: "Results",
      defaultWidth: 165,
      render: (r) =>
        r.counts ? (
          <span className="text-xs">
            <span className="font-mono">{r.counts.passed}</span> passed ·{" "}
            <span className="font-mono">{r.counts.failed}</span> failed
            {r.counts.error ? ` · ${r.counts.error} errors` : ""}
            {r.counts.cancelled ? ` · ${r.counts.cancelled} cancelled` : ""}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {isActive(r.status) ? "In progress" : "No final summary"}
          </span>
        ),
    },
    {
      key: "application",
      filter: [
        columnFilter(
          "applicationId",
          "Application ID",
          "text",
          (r) => r.targetId,
        ),
        columnFilter("application", "Application", "text", (r) => r.targetName),
        columnFilter(
          "environment",
          "Environment",
          "enum",
          (r) => r.environment,
        ),
      ],
      label: "Application",
      defaultWidth: 240,
      render: (r) => (
        <div>
          <p className="truncate text-xs">{r.targetName}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {r.environment}
          </p>
        </div>
      ),
    },
    {
      key: "created",
      filter: columnFilter("createdAt", "Created", "date", (r) => r.createdAt),
      label: "Created",
      sortKey: "created",
      defaultWidth: 195,
      render: (r) => (
        <span className="font-mono text-[11px]">
          {formatDateTime(r.createdAt)}
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
      render: (r) => <EvalCost costs={r.costs} />,
    },
    {
      key: "duration",
      filter: columnFilter("duration", "Duration (ms)", "number", (r) =>
        evalDurationMs(r, referenceTime ?? Date.now()),
      ),
      label: "Duration",
      defaultWidth: 100,
      render: (r) => (
        <span className="font-mono text-xs">
          <EvalDuration run={r} />
        </span>
      ),
    },
  ];
  const suiteColumns: DataTableColumn<SuiteRow, "suite">[] = [
    {
      key: "suite",
      filter: [
        columnFilter(
          "suite",
          "Suite",
          "text",
          (r) => r.suite.name ?? r.suite.id,
        ),
        columnFilter("suiteId", "Suite ID", "text", (r) => r.suite.id),
      ],
      label: "Suite",
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
            <DetailLink
              href={evalNavigationHref(
                evalSuiteHref(r.target.id, r.suite.id),
                searchParams,
              )}
            >
              <span className="truncate">
                {r.suite.name ?? displayName(r.suite.id)}
              </span>
            </DetailLink>
          </Button>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
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
          <p className="truncate text-xs">{r.target.name}</p>
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
            termination={r.latest.termination}
          />
        ) : (
          <span className="text-xs text-muted-foreground">Never run</span>
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
      title="Evals"
      description="Conversation suites and saved evaluation results"
      actions={
        <>
          {selectedRuns.length === 2 && view === "runs" ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                navigate(evalCompareHref(selectedRuns[1], selectedRuns[0]))
              }
            >
              <GitCompareArrows />
              Compare 2 runs
            </Button>
          ) : null}
          <LiveRefreshButton
            enabled={query.live}
            status={live.status}
            onToggle={() => update({ live: !query.live })}
          />
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="Refresh evals"
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
            Run evaluations
          </Button>
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
        {filtered
          ? "No evals match these filters"
          : view === "runs"
            ? "No eval runs yet"
            : "No suites available"}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "Change your search or clear the filters."
          : view === "runs"
            ? "Run a conversation suite to record outcomes and grading evidence."
            : targets.targets.length
              ? "Reconnect the application and refresh to discover its registered suites."
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
        {view === "runs" ? (
          <DataTable
            query={{
              keys: {
                q: "q",
                sort: "sort",
                dir: "dir",
                cursor: "cursor",
                pageSize: "pageSize",
              },
              defaults: {
                sort: preferences?.sort ?? "created",
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
            columns={runColumns}
            initialLayout={preferences?.layout}
            tableId="legacy-eval-runs"
            search={{
              label: "Search evals",
              placeholder:
                view === "runs"
                  ? "Search suite, application, or run ID…"
                  : "Search suites…",
            }}
            data={history.runs}
            getRowKey={(r) => r.id}
            onRowClick={(r) => chooseRun(r.id)}
            rowTone={(r) =>
              r.status === "failed" || r.status === "error"
                ? "danger"
                : undefined
            }
            header={header}
            emptyState={empty}
          />
        ) : (
          <DataTable
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
            columns={suiteColumns}
            tableId="eval-suites"
            search={{
              label: "Search evals",
              placeholder: "Search suites…",
            }}
            data={suiteRows}
            getRowKey={(r) => r.id}
            onRowClick={(r) => chooseSuite(r)}
            header={header}
            emptyState={empty}
          />
        )}
      </div>
      <EvalRunSetup targets={targets} matchPath={`/evals/${view}`} />
    </div>
  );
}

import { FirstObservation } from "@/features/telemetry/components/first-observation";
