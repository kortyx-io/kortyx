import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { useCallback, useMemo } from "react";
import {
  PAGE_SIZE,
  PAGE_SIZES,
  providers,
  statuses,
} from "@/features/runs/lib/constants";
import type { Run, RunStatus, SortKey } from "@/features/runs/schema";

const sortKeys: SortKey[] = ["started", "duration", "tokens", "cost", "status"];

const baseSearchParams = {
  q: parseAsString.withDefault(""),
  env: parseAsString.withDefault("All environments"),
  range: parseAsString.withDefault("24 hours"),
  startedAfter: parseAsString.withDefault(""),
  startedBefore: parseAsString.withDefault(""),
  status: parseAsArrayOf(parseAsStringLiteral(statuses)).withDefault([]),
  provider: parseAsArrayOf(parseAsStringLiteral(providers)).withDefault([]),
  tool: parseAsBoolean.withDefault(false),
  workflow: parseAsString.withDefault(""),
  path: parseAsString.withDefault(""),
  session: parseAsString.withDefault(""),
  model: parseAsString.withDefault(""),
  result: parseAsString.withDefault(""),
  minCost: parseAsFloat.withDefault(0),
  minDuration: parseAsFloat.withDefault(0),
  minTokens: parseAsInteger.withDefault(0),
  cursor: parseAsInteger.withDefault(0),
  live: parseAsBoolean.withDefault(false),
};

/**
 * Per-user defaults (e.g. from a saved profile) applied when the corresponding
 * URL param is absent. nuqs clears params that equal the default, so these stay
 * the source of truth across sessions while the URL stays shareable.
 */
export type RunsQueryDefaults = {
  sort?: SortKey;
  dir?: "asc" | "desc";
  pageSize?: number;
};

/** The URL-backed portion of a saved runs view. Pagination and live refresh are intentionally excluded. */
export type RunsViewFilters = Pick<
  RunsParamChanges,
  | "q"
  | "env"
  | "range"
  | "startedAfter"
  | "startedBefore"
  | "status"
  | "provider"
  | "tool"
  | "workflow"
  | "path"
  | "session"
  | "model"
  | "result"
  | "minCost"
  | "minDuration"
  | "minTokens"
>;

export type RunsViewQuery = {
  filters: RunsViewFilters;
  sort: SortKey;
  dir: "asc" | "desc";
};

type RunsParamChanges = Partial<{
  q: string | null;
  env: string | null;
  range: string | null;
  startedAfter: string | null;
  startedBefore: string | null;
  status: RunStatus[] | null;
  provider: Run["provider"][] | null;
  tool: boolean | null;
  workflow: string | null;
  path: string | null;
  session: string | null;
  model: string | null;
  result: string | null;
  minCost: number | null;
  minDuration: number | null;
  minTokens: number | null;
  cursor: number | null;
  pageSize: number | null;
  sort: SortKey | null;
  dir: "asc" | "desc" | null;
  live: boolean | null;
}>;

/**
 * Owns the runs list URL state via nuqs: parsing typed search params, deriving
 * the filtered and sorted rows, and the mutations that write changes back.
 */
export function useRunsQuery(initialRuns: Run[], defaults?: RunsQueryDefaults) {
  const searchParams = useMemo(
    () => ({
      ...baseSearchParams,
      pageSize: parseAsInteger.withDefault(defaults?.pageSize ?? PAGE_SIZE),
      sort: parseAsStringLiteral(sortKeys).withDefault(
        defaults?.sort ?? "started",
      ),
      dir: parseAsStringLiteral(["asc", "desc"]).withDefault(
        defaults?.dir ?? "desc",
      ),
    }),
    [defaults?.pageSize, defaults?.sort, defaults?.dir],
  );

  const [params, setQueryStates] = useQueryStates(searchParams);

  const {
    q: query,
    env: environment,
    range: timeRange,
    startedAfter,
    startedBefore,
    status: selectedStatuses,
    provider: rawSelectedProviders,
    tool: toolOnly,
    workflow,
    path,
    session,
    model,
    result,
    minCost,
    minDuration,
    minTokens,
    sort,
    dir: direction,
    live,
  } = params;

  const selectedProviders = rawSelectedProviders as Run["provider"][];

  const cursor = Math.max(0, params.cursor);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(params.pageSize)
    ? params.pageSize
    : PAGE_SIZE;

  // Any filter change resets pagination unless the cursor is set explicitly.
  const setParams = useCallback(
    (changes: RunsParamChanges) => {
      void setQueryStates(
        "cursor" in changes ? changes : { ...changes, cursor: null },
      );
    },
    [setQueryStates],
  );

  const filteredRuns = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const includes = (value: string, filter: string) =>
      !filter || value.toLowerCase().includes(filter.trim().toLowerCase());
    const rangeSeconds = getTimeRangeSeconds(timeRange);
    return initialRuns
      .filter(
        (run) =>
          environment === "All environments" || run.environment === environment,
      )
      .filter(
        (run) =>
          selectedStatuses.length === 0 ||
          selectedStatuses.includes(run.status),
      )
      .filter(
        (run) =>
          selectedProviders.length === 0 ||
          selectedProviders.includes(run.provider),
      )
      .filter((run) => !toolOnly || run.hasTool)
      .filter((run) =>
        timeRange === "Custom range"
          ? isWithinCustomRange(run.startedAt, startedAfter, startedBefore)
          : rangeSeconds === null ||
            (getStartedAgoSeconds(run.started) ?? Number.POSITIVE_INFINITY) <=
              rangeSeconds,
      )
      .filter((run) => includes(run.workflow, workflow))
      .filter((run) => includes(run.path.join(" "), path))
      .filter((run) => includes(run.session, session))
      .filter((run) => includes(run.model, model))
      .filter((run) => includes(run.result, result))
      .filter((run) => !minCost || (run.cost ?? -1) >= minCost)
      .filter((run) => !minDuration || run.duration >= minDuration)
      .filter((run) => !minTokens || (run.tokens ?? -1) >= minTokens)
      .filter((run) => {
        if (!needle) return true;
        return [
          run.id,
          run.session,
          run.workflow,
          run.path.join(" "),
          run.user,
          run.tenant,
          run.model,
          run.result,
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => {
        const values: Record<SortKey, [number, number]> = {
          started: [-initialRuns.indexOf(a), -initialRuns.indexOf(b)],
          duration: [a.duration, b.duration],
          tokens: [a.tokens ?? -1, b.tokens ?? -1],
          cost: [a.cost ?? -1, b.cost ?? -1],
          status: [statuses.indexOf(a.status), statuses.indexOf(b.status)],
        };
        const [first, second] = values[sort];
        return direction === "asc" ? first - second : second - first;
      });
  }, [
    direction,
    environment,
    minCost,
    minDuration,
    minTokens,
    model,
    path,
    selectedProviders,
    query,
    result,
    selectedStatuses,
    session,
    sort,
    startedAfter,
    startedBefore,
    timeRange,
    toolOnly,
    workflow,
    initialRuns,
  ]);

  const activeFilterCount =
    selectedStatuses.length +
    selectedProviders.length +
    Number(toolOnly) +
    Number(Boolean(workflow)) +
    Number(Boolean(path)) +
    Number(Boolean(session)) +
    Number(Boolean(model)) +
    Number(Boolean(result)) +
    Number(Boolean(minCost)) +
    Number(Boolean(minDuration)) +
    Number(Boolean(minTokens));
  const hasActiveFilters =
    activeFilterCount > 0 ||
    query.length > 0 ||
    environment !== "All environments" ||
    timeRange !== "24 hours" ||
    Boolean(startedAfter) ||
    Boolean(startedBefore);

  function toggleStatus(status: RunStatus) {
    setParams({
      status: selectedStatuses.includes(status)
        ? selectedStatuses.filter((item) => item !== status)
        : [...selectedStatuses, status],
    });
  }

  function toggleProvider(provider: Run["provider"]) {
    setParams({
      provider: selectedProviders.includes(provider)
        ? selectedProviders.filter((item) => item !== provider)
        : [...selectedProviders, provider],
    });
  }

  function handleSort(key: SortKey) {
    setParams({
      sort: key,
      dir: sort === key && direction === "desc" ? "asc" : "desc",
    });
  }

  function setSortDirection(key: SortKey, nextDirection: "asc" | "desc") {
    setParams({ sort: key, dir: nextDirection });
  }

  function clearSort() {
    setParams({ sort: null, dir: null });
  }

  function setLive(next: boolean) {
    setParams({ live: next ? true : null });
  }

  function clearFilters() {
    setParams({
      q: null,
      env: null,
      range: null,
      startedAfter: null,
      startedBefore: null,
      status: null,
      provider: null,
      tool: null,
      workflow: null,
      path: null,
      session: null,
      model: null,
      result: null,
      minCost: null,
      minDuration: null,
      minTokens: null,
    });
  }

  const viewQuery: RunsViewQuery = {
    filters: {
      q: query || null,
      env: environment === "All environments" ? null : environment,
      range: timeRange === "24 hours" ? null : timeRange,
      startedAfter: startedAfter || null,
      startedBefore: startedBefore || null,
      status: selectedStatuses.length > 0 ? selectedStatuses : null,
      provider: selectedProviders.length > 0 ? selectedProviders : null,
      tool: toolOnly || null,
      workflow: workflow || null,
      path: path || null,
      session: session || null,
      model: model || null,
      result: result || null,
      minCost: minCost || null,
      minDuration: minDuration || null,
      minTokens: minTokens || null,
    },
    sort,
    dir: direction,
  };

  function applyViewQuery(view: RunsViewQuery) {
    setParams({
      ...view.filters,
      sort: view.sort,
      dir: view.dir,
      cursor: null,
    });
  }

  return {
    query,
    environment,
    timeRange,
    startedAfter,
    startedBefore,
    selectedStatuses,
    selectedProviders,
    toolOnly,
    workflow,
    path,
    session,
    model,
    result,
    minCost,
    minDuration,
    minTokens,
    cursor,
    pageSize,
    sort,
    direction,
    live,
    filteredRuns,
    activeFilterCount,
    hasActiveFilters,
    setParams,
    setLive,
    toggleStatus,
    toggleProvider,
    handleSort,
    setSortDirection,
    clearSort,
    clearFilters,
    viewQuery,
    applyViewQuery,
  };
}

function getTimeRangeSeconds(range: string) {
  switch (range) {
    case "Last hour":
      return 60 * 60;
    case "24 hours":
      return 24 * 60 * 60;
    case "7 days":
      return 7 * 24 * 60 * 60;
    default:
      return null;
  }
}

function getStartedAgoSeconds(started: string) {
  const match = /^(\d+)([smhd]) ago$/.exec(started);
  if (!match) return null;

  const unitSeconds = { s: 1, m: 60, h: 60 * 60, d: 24 * 60 * 60 };
  return Number(match[1]) * unitSeconds[match[2] as keyof typeof unitSeconds];
}

function isWithinCustomRange(
  startedAt: string,
  startedAfter: string,
  startedBefore: string,
) {
  const startedTime = Date.parse(startedAt);
  const afterTime = startedAfter
    ? Date.parse(startedAfter)
    : Number.NEGATIVE_INFINITY;
  const beforeTime = startedBefore
    ? Date.parse(startedBefore)
    : Number.POSITIVE_INFINITY;

  if (!Number.isFinite(startedTime)) return false;
  return startedTime >= afterTime && startedTime <= beforeTime;
}
