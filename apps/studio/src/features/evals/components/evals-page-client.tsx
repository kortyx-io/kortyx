"use client";
import type { EvalSuite } from "@kortyx/agent/evals";
import {
  ArrowLeft,
  FlaskConical,
  GitCompareArrows,
  Play,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { parseAsInteger, parseAsString, parseAsStringLiteral } from "nuqs";
import { useEffect, useState } from "react";
import {
  DataTable,
  type DataTableColumn,
  DataTableColumnsMenu,
  DataTableProvider,
} from "@/components/data-table";
import { DetailPage } from "@/components/detail/detail-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListTablePreferences } from "@/features/telemetry/hooks/use-list-table-preferences";
import type { ListTablePreferences } from "@/features/telemetry/lib/table-preferences";
import { formatDateTime, formatDurationMs } from "@/lib/format";
import { useStudioQueryStates } from "@/lib/nuqs";
import { evalRequest } from "../api/client";
import { useEvalRun } from "../hooks/use-eval-run";
import { displayName, isActive } from "../lib/presentation";
import {
  type EvalDetail,
  type EvalHistory,
  EvalHistorySchema,
  type EvalRunSummary,
  type EvalTargets,
  EvalTargetsResponseSchema,
} from "../schema";
import { EvalComparison } from "./eval-comparison";
import { EvalRunDetail } from "./eval-run-detail";
import { EvalRunSetup } from "./eval-run-setup";
import { EvalStatus } from "./eval-status";
import { EvalSuiteDetail } from "./eval-suite-detail";

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
  view: parseAsStringLiteral(["runs", "suites"] as const).withDefault("runs"),
  run: parseAsString,
  compare: parseAsString,
  case: parseAsString,
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
};
export function EvalsPageClient({
  initialTargets,
  initialHistory,
  initialDetail,
  initialError = "",
  preferences,
}: {
  initialTargets: EvalTargets;
  initialHistory: EvalHistory;
  initialDetail: EvalDetail | null;
  initialError?: string;
  preferences?: Partial<ListTablePreferences<Sort, unknown>>;
}) {
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
  const [working, setWorking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [setup, setSetup] = useState<{
    targetId: string;
    suiteId: string;
  } | null>(null);
  const [suiteDetail, setSuiteDetail] = useState<SuiteRow | null>(null);
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);
  const prefs = useListTablePreferences({
    cookieName: "kortyx_evals_table_prefs",
    defaults,
    initial: preferences,
  });
  const current = useEvalRun(query.run, initialDetail, refreshTick);
  const baseline = useEvalRun(query.compare, null, refreshTick);
  const update = (values: Partial<typeof query>) => {
    void setQuery(values);
  };
  const refresh = async () => {
    setRefreshing(true);
    setError("");
    const result = await Promise.allSettled([
      evalRequest("targets"),
      evalRequest("runs"),
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
    setRefreshTick((value) => value + 1);
    setRefreshing(false);
  };
  const activeHistory = history.runs.some((r) => isActive(r.status));
  useEffect(() => {
    if (!activeHistory) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void evalRequest("runs", undefined, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted)
            setHistory(EvalHistorySchema.parse(value));
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError("Live history connection lost. Refresh to reconnect.");
        });
    }, 2500);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [activeHistory]);
  const runSuite = async (
    targetId: string,
    suite: EvalSuite,
    caseIds: string[],
    repetitions: number,
  ) => {
    setWorking(true);
    setError("");
    try {
      const target = targets.targets.find((t) => t.id === targetId);
      const saved = await evalRequest("runs", {
        targetId,
        suiteId: suite.id,
        suiteRevision: target?.revisions[suite.id],
        caseIds,
        repetitions,
        concurrency: 1,
      });
      setSetup(null);
      setSuiteDetail(null);
      update({ run: saved.id, compare: null, case: null, view: "runs" });
      setHistory(EvalHistorySchema.parse(await evalRequest("runs")));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start this eval run.",
      );
    } finally {
      setWorking(false);
    }
  };
  const startSetup = (row?: SuiteRow) => {
    const target =
      row?.target ?? targets.targets.find((t) => t.manifest?.suites.length);
    setSetup({
      targetId: target?.id ?? targets.targets[0]?.id ?? "",
      suiteId: row?.suite.id ?? target?.manifest?.suites[0]?.id ?? "",
    });
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
  const applications = new Map([
    ...targets.targets.map((t) => [t.id, t.name] as const),
    ...history.runs.map((r) => [r.targetId, r.targetName] as const),
  ]);
  const needle = query.q.toLowerCase();
  const runs = history.runs.filter(
    (r) =>
      (query.application === "all" || query.application === r.targetId) &&
      (query.status === "all" || query.status === r.status) &&
      `${r.suiteName ?? ""} ${r.suiteId} ${r.targetName} ${r.environment} ${r.id}`
        .toLowerCase()
        .includes(needle),
  );
  const suites = suiteRows.filter(
    (r) =>
      (query.application === "all" || query.application === r.target.id) &&
      `${r.suite.name ?? ""} ${r.suite.id} ${r.target.name}`
        .toLowerCase()
        .includes(needle),
  );
  const direction = query.dir === "asc" ? 1 : -1;
  runs.sort(
    (a, b) =>
      direction *
      (query.sort === "name"
        ? (a.suiteName ?? a.suiteId).localeCompare(b.suiteName ?? b.suiteId)
        : query.sort === "status"
          ? a.status.localeCompare(b.status)
          : a.createdAt.localeCompare(b.createdAt)),
  );
  suites.sort((a, b) =>
    (a.suite.name ?? a.suite.id).localeCompare(b.suite.name ?? b.suite.id),
  );
  const clearFilters = () =>
    update({ q: "", status: "all", application: "all", cursor: 0 });
  const filtered = Boolean(
    query.q || query.status !== "all" || query.application !== "all",
  );
  const chooseRun = (id: string) => {
    setSuiteDetail(null);
    update({ run: id, compare: null, case: null });
  };
  const runColumns: DataTableColumn<EvalRunSummary, Sort>[] = [
    {
      key: "select",
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
            setSelectedRuns((current) =>
              e.target.checked
                ? [...current, r.id]
                : current.filter((id) => id !== r.id),
            )
          }
        />
      ),
    },
    {
      key: "suite",
      label: "Suite",
      sortKey: "name",
      defaultWidth: 260,
      render: (r) => (
        <div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => chooseRun(r.id)}
            className="max-w-full justify-start px-0 hover:bg-transparent"
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
      label: "Status",
      sortKey: "status",
      defaultWidth: 135,
      render: (r) => <EvalStatus status={r.status} />,
    },
    {
      key: "results",
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
      key: "duration",
      label: "Duration",
      defaultWidth: 100,
      render: (r) => (
        <span className="font-mono text-xs">
          {r.startedAt && r.endedAt
            ? formatDurationMs(Date.parse(r.endedAt) - Date.parse(r.startedAt))
            : "—"}
        </span>
      ),
    },
  ];
  const suiteColumns: DataTableColumn<SuiteRow>[] = [
    {
      key: "suite",
      label: "Suite",
      defaultWidth: 310,
      render: (r) => (
        <div>
          <Button
            variant="ghost"
            size="xs"
            className="max-w-full justify-start px-0 hover:bg-transparent"
            onClick={() => setSuiteDetail(r)}
          >
            <span className="truncate">
              {r.suite.name ?? displayName(r.suite.id)}
            </span>
          </Button>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {r.suite.id}
          </p>
        </div>
      ),
    },
    {
      key: "application",
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
      label: "Conversations",
      defaultWidth: 130,
      render: (r) => (
        <span className="font-mono text-xs">{r.suite.cases.length}</span>
      ),
    },
    {
      key: "latest",
      label: "Latest run",
      defaultWidth: 150,
      render: (r) =>
        r.latest ? (
          <EvalStatus status={r.latest.status} />
        ) : (
          <span className="text-xs text-muted-foreground">Never run</span>
        ),
    },
    {
      key: "run",
      label: "Execute",
      defaultWidth: 110,
      render: (r) => (
        <Button
          variant="outline"
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
    <div className="z-20 shrink-0 border-b bg-background/95 px-5 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Evals</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Conversation suites and saved evaluation results
            {history.runs.length === 100 ? " · Latest 100 runs" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedRuns.length === 2 && query.view === "runs" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                update({
                  run: selectedRuns[1],
                  compare: selectedRuns[0],
                  case: null,
                })
              }
            >
              <GitCompareArrows />
              Compare 2 runs
            </Button>
          ) : null}
          <Button
            variant="outline"
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
            Run suite
          </Button>
        </div>
      </div>
      <div className="flex gap-5 border-b">
        {["runs", "suites"].map((view) => (
          <button
            key={view}
            type="button"
            aria-pressed={query.view === view}
            className={`border-b-2 pb-2 text-xs font-medium ${query.view === view ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => {
              setSuiteDetail(null);
              update({
                view: view as "runs" | "suites",
                run: null,
                compare: null,
                case: null,
                cursor: 0,
                status: "all",
              });
            }}
          >
            {displayName(view)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 py-3">
        <div className="relative min-w-36 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2 size-4 text-muted-foreground" />
          <Input
            aria-label="Search evals"
            placeholder={
              query.view === "runs"
                ? "Search suite, application, or run ID…"
                : "Search suites…"
            }
            className="h-8 pl-9"
            value={query.q}
            onChange={(event) => update({ q: event.target.value, cursor: 0 })}
          />
        </div>
        <Select
          value={query.application}
          onValueChange={(value) => update({ application: value, cursor: 0 })}
        >
          <SelectTrigger
            aria-label="Filter by application"
            className="h-8 w-44"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All applications</SelectItem>
            {[...applications].map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {query.view === "runs" ? (
          <Select
            value={query.status}
            onValueChange={(value) => update({ status: value, cursor: 0 })}
          >
            <SelectTrigger aria-label="Filter by status" className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              {[
                "passed",
                "failed",
                "error",
                "running",
                "queued",
                "cancelled",
              ].map((value) => (
                <SelectItem key={value} value={value}>
                  {displayName(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {filtered ? (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            <X />
            Clear
          </Button>
        ) : null}
        <DataTableColumnsMenu />
      </div>
      {targets.targets.some((t) => t.error) ? (
        <p className="pb-3 text-xs text-muted-foreground">
          {targets.targets.filter((t) => t.error).length} application connection
          unavailable. Saved results can still be inspected.
        </p>
      ) : null}
    </div>
  );
  const empty = (
    <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
      <FlaskConical className="mb-3 size-7 text-muted-foreground" />
      <h2 className="font-medium">
        {filtered
          ? "No evals match these filters"
          : query.view === "runs"
            ? "No eval runs yet"
            : "No suites available"}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "Change your search or clear the filters."
          : query.view === "runs"
            ? "Run a conversation suite to record outcomes and grading evidence."
            : targets.targets.length
              ? "Reconnect the application and refresh to discover its registered suites."
              : "Connect an application eval endpoint in your Studio API configuration."}
      </p>
      {filtered ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={clearFilters}
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  );
  const pageSize = [10, 20, 50, 100].includes(query.pageSize)
    ? query.pageSize
    : 20;
  const totalCount = query.view === "runs" ? runs.length : suites.length;
  const lastPageOffset =
    Math.max(0, Math.ceil(totalCount / pageSize) - 1) * pageSize;
  const pagination = {
    cursor: Math.min(Math.max(0, query.cursor), lastPageOffset),
    pageSize,
    pageSizes: [10, 20, 50, 100],
    totalCount,
    onCursorChange: (cursor: number) => update({ cursor }),
    onPageSizeChange: (pageSize: number) => {
      prefs.save({ pageSize });
      update({ pageSize, cursor: 0 });
    },
  };
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {error || current.error ? (
        <div
          role="alert"
          className="flex shrink-0 items-start justify-between gap-2 rounded-md border border-red-500/25 bg-red-500/5 px-4 py-2 text-xs text-red-700 dark:text-red-400"
        >
          <span>{error || current.error}</span>
          <Button variant="ghost" size="xs" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        {query.run ? (
          current.detail ? (
            <DetailPage
              title="Eval run"
              description="Conversation outcomes and evidence"
            >
              {query.compare ? (
                <EvalComparison
                  candidate={current.detail}
                  baseline={baseline.detail}
                  baselineId={query.compare}
                  history={history}
                  loading={baseline.loading}
                  error={baseline.error}
                  onBaselineChange={(id) => update({ compare: id })}
                  onBack={() => update({ compare: null })}
                />
              ) : (
                <EvalRunDetail
                  run={current.detail}
                  caseKey={query.case}
                  onCaseChange={(key) => update({ case: key })}
                  onBack={() =>
                    update({ run: null, compare: null, case: null })
                  }
                  canRun={targets.canRun}
                  canCompare={history.runs.some(
                    (r) => r.id !== query.run && !isActive(r.status),
                  )}
                  cancelling={working}
                  onCancel={() => {
                    setWorking(true);
                    void evalRequest(`runs/${current.detail?.id}/cancel`, {})
                      .then(() => setRefreshTick((n) => n + 1))
                      .catch((cause) =>
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Could not cancel the run.",
                        ),
                      )
                      .finally(() => setWorking(false));
                  }}
                  onCompare={() => {
                    const other = history.runs.find(
                      (r) =>
                        r.id !== current.detail?.id &&
                        r.suiteId === current.detail?.suiteId &&
                        r.targetId === current.detail?.targetId &&
                        !isActive(r.status),
                    );
                    update({
                      compare:
                        other?.id ??
                        history.runs.find(
                          (r) => r.id !== query.run && !isActive(r.status),
                        )?.id ??
                        null,
                    });
                    if (!other && history.runs.length < 2)
                      setError(
                        "Run this suite again to create a second result for comparison.",
                      );
                  }}
                />
              )}
            </DetailPage>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl border bg-background">
              <output className="text-sm text-muted-foreground">
                {current.loading
                  ? "Loading eval run…"
                  : "This eval run could not be loaded."}
              </output>
              <Button
                variant="outline"
                size="sm"
                onClick={() => update({ run: null, compare: null, case: null })}
              >
                <ArrowLeft />
                Run history
              </Button>
            </div>
          )
        ) : suiteDetail ? (
          <DetailPage
            title={suiteDetail.suite.name ?? suiteDetail.suite.id}
            description="Suite definition"
          >
            <EvalSuiteDetail
              suite={suiteDetail.suite}
              target={suiteDetail.target}
              canRun={targets.canRun}
              onBack={() => setSuiteDetail(null)}
              onRun={() => startSetup(suiteDetail)}
            />
          </DetailPage>
        ) : query.view === "runs" ? (
          <DataTableProvider
            columns={runColumns}
            initialLayout={prefs.value.layout}
            onLayoutChange={(layout) => prefs.save({ layout })}
          >
            <DataTable
              data={runs}
              getRowKey={(r) => r.id}
              onRowClick={(r) => chooseRun(r.id)}
              rowClassName={(r) =>
                r.status === "failed" || r.status === "error"
                  ? "bg-red-500/[0.025]"
                  : undefined
              }
              sort={query.sort}
              direction={query.dir}
              onSort={(key) =>
                update({
                  sort: key,
                  dir:
                    query.sort === key && query.dir === "desc" ? "asc" : "desc",
                  cursor: 0,
                })
              }
              onSetSortDirection={(key, dir) =>
                update({ sort: key, dir, cursor: 0 })
              }
              onClearSort={() =>
                update({ sort: "created", dir: "desc", cursor: 0 })
              }
              header={header}
              emptyState={empty}
              pagination={pagination}
            />
          </DataTableProvider>
        ) : (
          <DataTableProvider columns={suiteColumns}>
            <DataTable
              data={suites}
              getRowKey={(r) => r.id}
              onRowClick={(r) => setSuiteDetail(r)}
              header={header}
              emptyState={empty}
              pagination={pagination}
            />
          </DataTableProvider>
        )}
      </div>
      <EvalRunSetup
        targets={targets}
        error={error}
        selection={setup}
        onClose={() => setSetup(null)}
        onRun={runSuite}
        working={working}
      />
    </div>
  );
}
