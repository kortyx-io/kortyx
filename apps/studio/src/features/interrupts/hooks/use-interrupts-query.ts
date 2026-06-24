import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { useCallback, useMemo } from "react";
import type {
  Interrupt,
  InterruptSortKey,
  InterruptStatus,
} from "@/features/interrupts/schema";
import { PAGE_SIZE, PAGE_SIZES } from "@/features/runs/lib/constants";

const interruptStatuses = [
  "pending",
  "resolved",
  "expired",
  "failed",
  "cancelled",
] as const;
const interruptTypes = ["choice", "multi-choice", "text"] as const;
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
      ).withDefault(["pending"]),
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
    }),
    [defaults?.dir, defaults?.pageSize, defaults?.sort],
  );
  const [params, setQueryStates] = useQueryStates(parsers);
  const cursor = Math.max(0, params.cursor);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(params.pageSize)
    ? params.pageSize
    : PAGE_SIZE;
  const setParams = useCallback(
    (changes: Changes) => {
      void setQueryStates(
        "cursor" in changes ? changes : { ...changes, cursor: null },
      );
    },
    [setQueryStates],
  );
  const filteredInterrupts = useMemo(() => {
    const includes = (value: string | undefined, filter: string) =>
      !filter || value?.toLowerCase().includes(filter.trim().toLowerCase());
    const rangeMs =
      params.range === "Last hour"
        ? 3_600_000
        : params.range === "24 hours"
          ? 86_400_000
          : params.range === "7 days"
            ? 604_800_000
            : Number.POSITIVE_INFINITY;
    const needle = params.q.trim().toLowerCase();
    return initialInterrupts
      .filter((interrupt) => {
        const ageSeconds = Math.floor(
          (Date.now() - Date.parse(interrupt.createdAt)) / 1000,
        );
        return (
          (params.env === "All environments" ||
            interrupt.environment === params.env) &&
          (!params.status.length || params.status.includes(interrupt.status)) &&
          (!params.type.length || params.type.includes(interrupt.type)) &&
          (!params.outcome.length ||
            (interrupt.resumeOutcome !== undefined &&
              params.outcome.includes(interrupt.resumeOutcome))) &&
          (!params.error || Boolean(interrupt.resumeError)) &&
          includes(interrupt.workflow, params.workflow) &&
          includes(interrupt.node, params.node) &&
          includes(interrupt.session, params.session) &&
          includes(interrupt.user, params.user) &&
          includes(interrupt.tenant, params.tenant) &&
          includes(interrupt.resolvedBy, params.resolver) &&
          (!params.minAge || ageSeconds >= params.minAge * 60) &&
          (!params.maxAge || ageSeconds <= params.maxAge * 60) &&
          (params.range === "Custom range"
            ? Date.parse(interrupt.createdAt) >=
                (params.startedAfter
                  ? Date.parse(params.startedAfter)
                  : Number.NEGATIVE_INFINITY) &&
              Date.parse(interrupt.createdAt) <=
                (params.startedBefore
                  ? Date.parse(params.startedBefore)
                  : Number.POSITIVE_INFINITY)
            : Date.now() - Date.parse(interrupt.createdAt) <= rangeMs) &&
          (!needle ||
            [
              interrupt.id,
              interrupt.resumeToken,
              interrupt.session,
              interrupt.workflow,
              interrupt.node,
              interrupt.user,
              interrupt.tenant,
              interrupt.question,
              interrupt.response,
              interrupt.resumeError,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(needle))
        );
      })
      .sort((a, b) => {
        const createdA = Date.parse(a.createdAt);
        const createdB = Date.parse(b.createdAt);
        const priority = (item: Interrupt) =>
          item.status === "pending" ? 0 : 1;
        if (params.sort === "priority") {
          const primary = priority(a) - priority(b);
          const value =
            primary ||
            (a.status === "pending"
              ? createdA - createdB
              : createdB - createdA);
          return params.dir === "asc" ? value : -value;
        }
        const values: Record<
          Exclude<InterruptSortKey, "priority">,
          [number, number]
        > = {
          created: [createdA, createdB],
          age: [Date.now() - createdA, Date.now() - createdB],
          status: [
            interruptStatuses.indexOf(a.status),
            interruptStatuses.indexOf(b.status),
          ],
        };
        const [first, second] = values[params.sort];
        return params.dir === "asc" ? first - second : second - first;
      });
  }, [initialInterrupts, params]);
  const activeFilterCount =
    Number(params.status.join(",") !== "pending") +
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
  const toggleStatus = (status: InterruptStatus) =>
    setParams({
      status: params.status.includes(status)
        ? params.status.filter((item) => item !== status)
        : [...params.status, status],
    });
  const toggleType = (type: (typeof interruptTypes)[number]) =>
    setParams({
      type: params.type.includes(type)
        ? params.type.filter((item) => item !== type)
        : [...params.type, type],
    });
  const toggleOutcome = (outcome: (typeof outcomes)[number]) =>
    setParams({
      outcome: params.outcome.includes(outcome)
        ? params.outcome.filter((item) => item !== outcome)
        : [...params.outcome, outcome],
    });
  const handleSort = (sort: InterruptSortKey) =>
    setParams({
      sort,
      dir: params.sort === sort && params.dir === "desc" ? "asc" : "desc",
    });
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
    status: params.status.join(",") === "pending" ? null : params.status,
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
  const standardViewQuery: InterruptsViewQuery = {
    sort: "priority",
    dir: "asc",
  };
  const applyViewQuery = (view: InterruptsViewQuery) =>
    setParams({ ...view, cursor: null });
  return {
    ...params,
    cursor,
    pageSize,
    filteredInterrupts,
    activeFilterCount,
    hasActiveFilters,
    setParams,
    toggleStatus,
    toggleType,
    toggleOutcome,
    handleSort,
    setSortDirection: (sort: InterruptSortKey, dir: "asc" | "desc") =>
      setParams({ sort, dir }),
    clearSort: () => setParams({ sort: null, dir: null }),
    clearFilters,
    setLive: (live: boolean) => setParams({ live: live || null }),
    viewQuery,
    standardViewQuery,
    applyViewQuery,
  };
}
