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
import { PAGE_SIZE, PAGE_SIZES, statuses } from "@/features/runs/lib/constants";
import type { Run, RunStatus, SortKey } from "@/features/runs/types";

const sortKeys: SortKey[] = ["started", "duration", "tokens", "cost", "status"];

const baseSearchParams = {
  q: parseAsString.withDefault(""),
  env: parseAsString.withDefault("All environments"),
  range: parseAsString.withDefault("24 hours"),
  status: parseAsArrayOf(parseAsStringLiteral(statuses)).withDefault([]),
  provider: parseAsString.withDefault(""),
  tool: parseAsBoolean.withDefault(false),
  minCost: parseAsFloat.withDefault(0),
  minDuration: parseAsFloat.withDefault(0),
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

type RunsParamChanges = Partial<{
  q: string | null;
  env: string | null;
  range: string | null;
  status: RunStatus[] | null;
  provider: string | null;
  tool: boolean | null;
  minCost: number | null;
  minDuration: number | null;
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
    status: selectedStatuses,
    provider,
    tool: toolOnly,
    minCost,
    minDuration,
    sort,
    dir: direction,
    live,
  } = params;

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
      .filter((run) => !provider || run.provider === provider)
      .filter((run) => !toolOnly || run.hasTool)
      .filter((run) => !minCost || (run.cost ?? -1) >= minCost)
      .filter((run) => !minDuration || run.duration >= minDuration)
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
    provider,
    query,
    selectedStatuses,
    sort,
    toolOnly,
    initialRuns,
  ]);

  const activeFilterCount =
    selectedStatuses.length +
    Number(Boolean(provider)) +
    Number(toolOnly) +
    Number(Boolean(minCost)) +
    Number(Boolean(minDuration));
  const hasActiveFilters =
    activeFilterCount > 0 ||
    query.length > 0 ||
    environment !== "All environments" ||
    timeRange !== "24 hours";

  function toggleStatus(status: RunStatus) {
    setParams({
      status: selectedStatuses.includes(status)
        ? selectedStatuses.filter((item) => item !== status)
        : [...selectedStatuses, status],
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
      status: null,
      provider: null,
      tool: null,
      minCost: null,
      minDuration: null,
    });
  }

  return {
    query,
    environment,
    timeRange,
    selectedStatuses,
    provider,
    toolOnly,
    minCost,
    minDuration,
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
    handleSort,
    setSortDirection,
    clearSort,
    clearFilters,
  };
}
