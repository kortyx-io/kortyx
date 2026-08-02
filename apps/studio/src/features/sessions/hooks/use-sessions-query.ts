import {
  STUDIO_TIME_RANGES,
  type StudioTimeRange,
} from "@kortyx/telemetry-contracts";
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs";
import { useCallback, useMemo } from "react";
import { PAGE_SIZE, PAGE_SIZES } from "@/features/runs/lib/constants";
import type {
  Session,
  SessionSortKey,
  SessionStatus,
} from "@/features/sessions/schema";
import {
  filterPanelParser,
  useFilterPanelState,
  useStudioQueryStates,
} from "@/lib/nuqs";

const sessionStatuses = [
  "running",
  "completed",
  "interrupted",
  "incomplete",
  "failed",
  "cancelled",
] as const;
const sortKeys = [
  "activity",
  "duration",
  "tokens",
  "cost",
  "runs",
  "status",
] as const;

type Changes = Partial<{
  q: string | null;
  env: string | null;
  range: StudioTimeRange | null;
  startedAfter: string | null;
  startedBefore: string | null;
  status: SessionStatus[] | null;
  workflow: string | null;
  user: string | null;
  tenant: string | null;
  provider: string | null;
  model: string | null;
  tags: string | null;
  error: boolean | null;
  interrupt: boolean | null;
  checkpoint: boolean | null;
  fork: boolean | null;
  minCost: number | null;
  maxCost: number | null;
  minTokens: number | null;
  maxTokens: number | null;
  minDuration: number | null;
  maxDuration: number | null;
  cursor: number | null;
  pageSize: number | null;
  sort: SessionSortKey | null;
  dir: "asc" | "desc" | null;
  live: boolean | null;
}>;
export type SessionsViewQuery = Omit<Changes, "cursor" | "pageSize" | "live">;

export function useSessionsQuery(
  initialSessions: Session[],
  defaults?: { sort?: SessionSortKey; dir?: "asc" | "desc"; pageSize?: number },
) {
  const parsers = useMemo(
    () => ({
      q: parseAsString.withDefault(""),
      env: parseAsString.withDefault("All environments"),
      range: parseAsStringLiteral(STUDIO_TIME_RANGES).withDefault("24 hours"),
      startedAfter: parseAsString.withDefault(""),
      startedBefore: parseAsString.withDefault(""),
      status: parseAsArrayOf(parseAsStringLiteral(sessionStatuses)).withDefault(
        [],
      ),
      workflow: parseAsString.withDefault(""),
      user: parseAsString.withDefault(""),
      tenant: parseAsString.withDefault(""),
      provider: parseAsString.withDefault(""),
      model: parseAsString.withDefault(""),
      tags: parseAsString.withDefault(""),
      error: parseAsBoolean.withDefault(false),
      interrupt: parseAsBoolean.withDefault(false),
      checkpoint: parseAsBoolean.withDefault(false),
      fork: parseAsBoolean.withDefault(false),
      minCost: parseAsFloat.withDefault(0),
      maxCost: parseAsFloat.withDefault(0),
      minTokens: parseAsInteger.withDefault(0),
      maxTokens: parseAsInteger.withDefault(0),
      minDuration: parseAsFloat.withDefault(0),
      maxDuration: parseAsFloat.withDefault(0),
      cursor: parseAsInteger.withDefault(0),
      pageSize: parseAsInteger.withDefault(defaults?.pageSize ?? PAGE_SIZE),
      sort: parseAsStringLiteral(sortKeys).withDefault(
        defaults?.sort ?? "activity",
      ),
      dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault(
        defaults?.dir ?? "desc",
      ),
      live: parseAsBoolean.withDefault(false),
      filterPanel: filterPanelParser,
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
  const setParams = useCallback(
    (changes: Changes) =>
      setQueryStates(
        "cursor" in changes ? changes : { ...changes, cursor: null },
      ),
    [setQueryStates],
  );
  const activeFilterCount =
    params.status.length +
    Number(params.error) +
    Number(params.interrupt) +
    Number(params.checkpoint) +
    Number(params.fork) +
    [
      params.workflow,
      params.user,
      params.tenant,
      params.provider,
      params.model,
      params.tags,
      params.minCost,
      params.maxCost,
      params.minTokens,
      params.maxTokens,
      params.minDuration,
      params.maxDuration,
    ].filter(Boolean).length;
  const hasActiveFilters =
    activeFilterCount > 0 ||
    Boolean(params.q) ||
    params.env !== "All environments" ||
    params.range !== "24 hours";
  const clearFilters = () =>
    setParams({
      q: null,
      env: null,
      range: null,
      startedAfter: null,
      startedBefore: null,
      status: null,
      workflow: null,
      user: null,
      tenant: null,
      provider: null,
      model: null,
      tags: null,
      error: null,
      interrupt: null,
      checkpoint: null,
      fork: null,
      minCost: null,
      maxCost: null,
      minTokens: null,
      maxTokens: null,
      minDuration: null,
      maxDuration: null,
    });
  const viewQuery: SessionsViewQuery = {
    q: params.q || null,
    env: params.env === "All environments" ? null : params.env,
    range: params.range === "24 hours" ? null : params.range,
    startedAfter: params.startedAfter || null,
    startedBefore: params.startedBefore || null,
    status: params.status.length ? params.status : null,
    workflow: params.workflow || null,
    user: params.user || null,
    tenant: params.tenant || null,
    provider: params.provider || null,
    model: params.model || null,
    tags: params.tags || null,
    error: params.error || null,
    interrupt: params.interrupt || null,
    checkpoint: params.checkpoint || null,
    fork: params.fork || null,
    minCost: params.minCost || null,
    maxCost: params.maxCost || null,
    minTokens: params.minTokens || null,
    maxTokens: params.maxTokens || null,
    minDuration: params.minDuration || null,
    maxDuration: params.maxDuration || null,
    sort: params.sort,
    dir: params.dir,
  };

  return {
    ...params,
    cursor,
    pageSize,
    filteredSessions: initialSessions,
    activeFilterCount,
    hasActiveFilters,
    setParams,
    toggleStatus: (status: SessionStatus) =>
      setParams({
        status: params.status.includes(status)
          ? params.status.filter((item) => item !== status)
          : [...params.status, status],
      }),
    handleSort: (sort: SessionSortKey) =>
      setParams({
        sort,
        dir: params.sort === sort && params.dir === "desc" ? "asc" : "desc",
      }),
    setSortDirection: (sort: SessionSortKey, dir: "asc" | "desc") =>
      setParams({ sort, dir }),
    clearSort: () => setParams({ sort: null, dir: null }),
    clearFilters,
    setLive: (live: boolean) =>
      setQueryStates({ live: live || null }, { shallow: true }),
    viewQuery,
    standardViewQuery: {
      sort: "activity",
      dir: "desc",
    } satisfies SessionsViewQuery,
    applyViewQuery: (view: SessionsViewQuery) =>
      setParams({ ...view, cursor: null }),
    filtersOpen,
    setFiltersOpen,
    toggleFiltersOpen,
  };
}
