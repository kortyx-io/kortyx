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
import { PAGE_SIZE, PAGE_SIZES } from "@/features/runs/lib/constants";
import type {
  Session,
  SessionSortKey,
  SessionStatus,
} from "@/features/sessions/schema";

const sessionStatuses = [
  "running",
  "completed",
  "interrupted",
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
  range: string | null;
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
      range: parseAsString.withDefault("24 hours"),
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

  const filteredSessions = useMemo(() => {
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
    return initialSessions
      .filter(
        (session) =>
          (params.env === "All environments" ||
            session.environment === params.env) &&
          (!params.status.length || params.status.includes(session.status)) &&
          (!params.error || Boolean(session.latestError)) &&
          (!params.interrupt ||
            Boolean(session.pendingInterrupt || session.interrupted)) &&
          (!params.checkpoint || Boolean(session.checkpoints)) &&
          (!params.fork || Boolean(session.hasFork)) &&
          includes(session.workflow, params.workflow) &&
          includes(session.user, params.user) &&
          includes(session.tenant, params.tenant) &&
          (!params.provider ||
            session.providers
              .join(" ")
              .toLowerCase()
              .includes(params.provider.toLowerCase())) &&
          (!params.model ||
            session.models
              .join(" ")
              .toLowerCase()
              .includes(params.model.toLowerCase())) &&
          (!params.tags ||
            session.tags
              .join(" ")
              .toLowerCase()
              .includes(params.tags.toLowerCase())) &&
          (!params.minCost || (session.cost ?? -1) >= params.minCost) &&
          (!params.maxCost ||
            (session.cost ?? Number.POSITIVE_INFINITY) <= params.maxCost) &&
          (!params.minTokens || (session.tokens ?? -1) >= params.minTokens) &&
          (!params.maxTokens ||
            (session.tokens ?? Number.POSITIVE_INFINITY) <= params.maxTokens) &&
          (!params.minDuration ||
            (session.duration ?? -1) >= params.minDuration) &&
          (!params.maxDuration ||
            (session.duration ?? Number.POSITIVE_INFINITY) <=
              params.maxDuration) &&
          (params.range === "Custom range"
            ? Date.parse(session.lastActivityAt) >=
                (params.startedAfter
                  ? Date.parse(params.startedAfter)
                  : Number.NEGATIVE_INFINITY) &&
              Date.parse(session.lastActivityAt) <=
                (params.startedBefore
                  ? Date.parse(params.startedBefore)
                  : Number.POSITIVE_INFINITY)
            : Date.now() - Date.parse(session.lastActivityAt) <= rangeMs) &&
          (!needle ||
            [
              session.id,
              session.user,
              session.tenant,
              session.workflow,
              session.latestResult,
              session.latestError,
              session.pendingInterrupt,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(needle)),
      )
      .sort((a, b) => {
        const values: Record<SessionSortKey, [number, number]> = {
          activity: [
            Date.parse(a.lastActivityAt),
            Date.parse(b.lastActivityAt),
          ],
          duration: [a.duration ?? -1, b.duration ?? -1],
          tokens: [a.tokens ?? -1, b.tokens ?? -1],
          cost: [a.cost ?? -1, b.cost ?? -1],
          runs: [a.runs, b.runs],
          status: [
            sessionStatuses.indexOf(a.status),
            sessionStatuses.indexOf(b.status),
          ],
        };
        const [first, second] = values[params.sort];
        return params.dir === "asc" ? first - second : second - first;
      });
  }, [initialSessions, params]);

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
  const toggleStatus = (status: SessionStatus) =>
    setParams({
      status: params.status.includes(status)
        ? params.status.filter((item) => item !== status)
        : [...params.status, status],
    });
  const handleSort = (sort: SessionSortKey) =>
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
  const standardViewQuery: SessionsViewQuery = {
    sort: "activity",
    dir: "desc",
  };
  const applyViewQuery = (view: SessionsViewQuery) =>
    setParams({ ...view, cursor: null });
  return {
    ...params,
    cursor,
    pageSize,
    filteredSessions,
    activeFilterCount,
    hasActiveFilters,
    setParams,
    toggleStatus,
    handleSort,
    setSortDirection: (sort: SessionSortKey, dir: "asc" | "desc") =>
      setParams({ sort, dir }),
    clearSort: () => setParams({ sort: null, dir: null }),
    clearFilters,
    setLive: (live: boolean) => setParams({ live: live || null }),
    viewQuery,
    standardViewQuery,
    applyViewQuery,
  };
}
