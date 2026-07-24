import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs";
import { useCallback, useMemo } from "react";
import type {
  Interrupt,
  InterruptSortKey,
  InterruptStatus,
} from "@/features/interrupts/schema";
import { PAGE_SIZE, PAGE_SIZES } from "@/features/runs/lib/constants";
import {
  filterPanelParser,
  useFilterPanelState,
  useStudioQueryStates,
} from "@/lib/nuqs";

const interruptStatuses = [
  "pending",
  "resolved",
  "expired",
  "failed",
  "cancelled",
] as const;
const interruptTypes = ["choice", "multi-choice", "text", "unknown"] as const;
const outcomes = [
  "resumed",
  "resume failed",
  "expired before resume",
  "cancelled",
] as const;
const sortKeys = ["priority", "created", "age", "status"] as const;

type Changes = Partial<{
  q: string | null;
  env: string | null;
  range: string | null;
  startedAfter: string | null;
  startedBefore: string | null;
  status: InterruptStatus[] | null;
  type: (typeof interruptTypes)[number][] | null;
  workflow: string | null;
  node: string | null;
  session: string | null;
  user: string | null;
  tenant: string | null;
  resolver: string | null;
  minAge: number | null;
  maxAge: number | null;
  outcome: (typeof outcomes)[number][] | null;
  error: boolean | null;
  cursor: number | null;
  pageSize: number | null;
  sort: InterruptSortKey | null;
  dir: "asc" | "desc" | null;
  live: boolean | null;
}>;
export type InterruptsViewQuery = Omit<Changes, "cursor" | "pageSize" | "live">;

export function useInterruptsQuery(
  initialInterrupts: Interrupt[],
  defaults?: {
    sort?: InterruptSortKey;
    dir?: "asc" | "desc";
    pageSize?: number;
  },
) {
  const parsers = useMemo(
    () => ({
      q: parseAsString.withDefault(""),
      env: parseAsString.withDefault("All environments"),
      range: parseAsString.withDefault("24 hours"),
      startedAfter: parseAsString.withDefault(""),
      startedBefore: parseAsString.withDefault(""),
      status: parseAsArrayOf(
        parseAsStringLiteral(interruptStatuses),
      ).withDefault([]),
      type: parseAsArrayOf(parseAsStringLiteral(interruptTypes)).withDefault(
        [],
      ),
      workflow: parseAsString.withDefault(""),
      node: parseAsString.withDefault(""),
      session: parseAsString.withDefault(""),
      user: parseAsString.withDefault(""),
      tenant: parseAsString.withDefault(""),
      resolver: parseAsString.withDefault(""),
      minAge: parseAsInteger.withDefault(0),
      maxAge: parseAsInteger.withDefault(0),
      outcome: parseAsArrayOf(parseAsStringLiteral(outcomes)).withDefault([]),
      error: parseAsBoolean.withDefault(false),
      cursor: parseAsInteger.withDefault(0),
      pageSize: parseAsInteger.withDefault(defaults?.pageSize ?? PAGE_SIZE),
      sort: parseAsStringLiteral(sortKeys).withDefault(
        defaults?.sort ?? "priority",
      ),
      dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault(
        defaults?.dir ?? "asc",
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
    params.type.length +
    params.outcome.length +
    Number(params.error) +
    [
      params.workflow,
      params.node,
      params.session,
      params.user,
      params.tenant,
      params.resolver,
      params.minAge,
      params.maxAge,
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
      type: null,
      workflow: null,
      node: null,
      session: null,
      user: null,
      tenant: null,
      resolver: null,
      minAge: null,
      maxAge: null,
      outcome: null,
      error: null,
    });
  const viewQuery: InterruptsViewQuery = {
    q: params.q || null,
    env: params.env === "All environments" ? null : params.env,
    range: params.range === "24 hours" ? null : params.range,
    startedAfter: params.startedAfter || null,
    startedBefore: params.startedBefore || null,
    status: params.status.length ? params.status : null,
    type: params.type.length ? params.type : null,
    workflow: params.workflow || null,
    node: params.node || null,
    session: params.session || null,
    user: params.user || null,
    tenant: params.tenant || null,
    resolver: params.resolver || null,
    minAge: params.minAge || null,
    maxAge: params.maxAge || null,
    outcome: params.outcome.length ? params.outcome : null,
    error: params.error || null,
    sort: params.sort,
    dir: params.dir,
  };

  return {
    ...params,
    cursor,
    pageSize,
    filteredInterrupts: initialInterrupts,
    activeFilterCount,
    hasActiveFilters,
    setParams,
    toggleStatus: (status: InterruptStatus) =>
      setParams({
        status: params.status.includes(status)
          ? params.status.filter((item) => item !== status)
          : [...params.status, status],
      }),
    toggleType: (type: (typeof interruptTypes)[number]) =>
      setParams({
        type: params.type.includes(type)
          ? params.type.filter((item) => item !== type)
          : [...params.type, type],
      }),
    toggleOutcome: (outcome: (typeof outcomes)[number]) =>
      setParams({
        outcome: params.outcome.includes(outcome)
          ? params.outcome.filter((item) => item !== outcome)
          : [...params.outcome, outcome],
      }),
    handleSort: (sort: InterruptSortKey) =>
      setParams({
        sort,
        dir: params.sort === sort && params.dir === "desc" ? "asc" : "desc",
      }),
    setSortDirection: (sort: InterruptSortKey, dir: "asc" | "desc") =>
      setParams({ sort, dir }),
    clearSort: () => setParams({ sort: null, dir: null }),
    clearFilters,
    setLive: (live: boolean) =>
      setQueryStates({ live: live || null }, { shallow: true }),
    viewQuery,
    standardViewQuery: {
      sort: "priority",
      dir: "asc",
    } satisfies InterruptsViewQuery,
    applyViewQuery: (view: InterruptsViewQuery) =>
      setParams({ ...view, cursor: null }),
    filtersOpen,
    setFiltersOpen,
    toggleFiltersOpen,
  };
}
