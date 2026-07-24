import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs";
import { useCallback, useMemo } from "react";
import { PAGE_SIZE, PAGE_SIZES, statuses } from "@/features/runs/lib/constants";
import type { Run, RunStatus, SortKey } from "@/features/runs/schema";
import {
  filterPanelParser,
  useFilterPanelState,
  useStudioQueryStates,
} from "@/lib/nuqs";

const sortKeys: SortKey[] = ["started", "duration", "tokens", "cost", "status"];

const baseSearchParams = {
  q: parseAsString.withDefault(""),
  env: parseAsString.withDefault("All environments"),
  range: parseAsString.withDefault("24 hours"),
  startedAfter: parseAsString.withDefault(""),
  startedBefore: parseAsString.withDefault(""),
  status: parseAsArrayOf(parseAsStringLiteral(statuses)).withDefault([]),
  provider: parseAsArrayOf(parseAsString).withDefault([]),
  tool: parseAsBoolean.withDefault(false),
  workflow: parseAsString.withDefault(""),
  version: parseAsString.withDefault(""),
  transition: parseAsString.withDefault(""),
  path: parseAsString.withDefault(""),
  session: parseAsString.withDefault(""),
  model: parseAsString.withDefault(""),
  result: parseAsString.withDefault(""),
  minCost: parseAsFloat.withDefault(0),
  minDuration: parseAsFloat.withDefault(0),
  minTokens: parseAsInteger.withDefault(0),
  cursor: parseAsInteger.withDefault(0),
  live: parseAsBoolean.withDefault(false),
  filterPanel: filterPanelParser,
};

export type RunsQueryDefaults = {
  sort?: SortKey;
  dir?: "asc" | "desc";
  pageSize?: number;
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
  version: string | null;
  transition: string | null;
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
  | "version"
  | "transition"
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

export function useRunsQuery(initialRuns: Run[], defaults?: RunsQueryDefaults) {
  const parsers = useMemo(
    () => ({
      ...baseSearchParams,
      pageSize: parseAsInteger.withDefault(defaults?.pageSize ?? PAGE_SIZE),
      sort: parseAsStringLiteral(sortKeys).withDefault(
        defaults?.sort ?? "started",
      ),
      dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault(
        defaults?.dir ?? "desc",
      ),
    }),
    [defaults?.dir, defaults?.pageSize, defaults?.sort],
  );
  const [params, setQueryStates] = useStudioQueryStates(parsers);
  const { filtersOpen, setFiltersOpen, toggleFiltersOpen } =
    useFilterPanelState(params.filterPanel, setQueryStates);
  const cursor = Math.max(0, params.cursor);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(params.pageSize)
    ? params.pageSize
    : PAGE_SIZE;
  const selectedProviders = params.provider as Run["provider"][];

  const setParams = useCallback(
    (changes: RunsParamChanges) =>
      setQueryStates(
        "cursor" in changes ? changes : { ...changes, cursor: null },
      ),
    [setQueryStates],
  );

  const activeFilterCount =
    params.status.length +
    selectedProviders.length +
    Number(params.tool) +
    [
      params.workflow,
      params.version,
      params.transition,
      params.path,
      params.session,
      params.model,
      params.result,
      params.minCost,
      params.minDuration,
      params.minTokens,
    ].filter(Boolean).length;
  const hasActiveFilters =
    activeFilterCount > 0 ||
    Boolean(params.q) ||
    params.env !== "All environments" ||
    params.range !== "24 hours" ||
    Boolean(params.startedAfter) ||
    Boolean(params.startedBefore);

  const clearFilters = () =>
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
      version: null,
      transition: null,
      path: null,
      session: null,
      model: null,
      result: null,
      minCost: null,
      minDuration: null,
      minTokens: null,
    });

  const viewQuery: RunsViewQuery = {
    filters: {
      q: params.q || null,
      env: params.env === "All environments" ? null : params.env,
      range: params.range === "24 hours" ? null : params.range,
      startedAfter: params.startedAfter || null,
      startedBefore: params.startedBefore || null,
      status: params.status.length ? params.status : null,
      provider: selectedProviders.length ? selectedProviders : null,
      tool: params.tool || null,
      workflow: params.workflow || null,
      version: params.version || null,
      transition: params.transition || null,
      path: params.path || null,
      session: params.session || null,
      model: params.model || null,
      result: params.result || null,
      minCost: params.minCost || null,
      minDuration: params.minDuration || null,
      minTokens: params.minTokens || null,
    },
    sort: params.sort,
    dir: params.dir,
  };

  return {
    query: params.q,
    environment: params.env,
    timeRange: params.range,
    startedAfter: params.startedAfter,
    startedBefore: params.startedBefore,
    selectedStatuses: params.status,
    selectedProviders,
    toolOnly: params.tool,
    workflow: params.workflow,
    version: params.version,
    transition: params.transition,
    path: params.path,
    session: params.session,
    model: params.model,
    result: params.result,
    minCost: params.minCost,
    minDuration: params.minDuration,
    minTokens: params.minTokens,
    cursor,
    pageSize,
    sort: params.sort,
    direction: params.dir,
    live: params.live,
    filteredRuns: initialRuns,
    activeFilterCount,
    hasActiveFilters,
    setParams,
    setLive: (live: boolean) =>
      setQueryStates({ live: live || null }, { shallow: true }),
    toggleStatus: (status: RunStatus) =>
      setParams({
        status: params.status.includes(status)
          ? params.status.filter((item) => item !== status)
          : [...params.status, status],
      }),
    toggleProvider: (provider: Run["provider"]) =>
      setParams({
        provider: selectedProviders.includes(provider)
          ? selectedProviders.filter((item) => item !== provider)
          : [...selectedProviders, provider],
      }),
    handleSort: (sort: SortKey) =>
      setParams({
        sort,
        dir: params.sort === sort && params.dir === "desc" ? "asc" : "desc",
      }),
    setSortDirection: (sort: SortKey, dir: "asc" | "desc") =>
      setParams({ sort, dir }),
    clearSort: () => setParams({ sort: null, dir: null }),
    clearFilters,
    viewQuery,
    applyViewQuery: (view: RunsViewQuery) =>
      setParams({
        ...view.filters,
        sort: view.sort,
        dir: view.dir,
        cursor: null,
      }),
    filtersOpen,
    setFiltersOpen,
    toggleFiltersOpen,
  };
}
