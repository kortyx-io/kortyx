"use client";

import { parseAsInteger, parseAsString, parseAsStringLiteral } from "nuqs";
import { useEffect, useState } from "react";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useSearchParams } from "@/lib/scoped-navigation";
import type { DataTableColumn, DataTableQueryConfig } from "./types";
export const TABLE_PAGE_SIZES = [10, 20, 50, 100] as const;

export function tableQueryKeys(tableId: string, config?: DataTableQueryConfig) {
  const global = config?.mode === "remote";
  return {
    q: global ? "q" : `tableSearch.${tableId}`,
    sort: global ? "sort" : `tableSort.${tableId}`,
    dir: global ? "dir" : `tableDirection.${tableId}`,
    cursor: global ? "cursor" : `tablePage.${tableId}`,
    pageSize: global ? "pageSize" : `tablePageSize.${tableId}`,
    filters:
      config?.mode === "remote" ? "tableFilters" : `tableFilters.${tableId}`,
    open: config?.mode === "remote" ? "filterPanel" : `filterPanel.${tableId}`,
    ...config?.keys,
  };
}

/** All table controls and saved views mutate the same URL-backed state. */
export function useTableQuery<T, S extends string>(
  tableId: string,
  columns: DataTableColumn<T, S>[],
  config?: DataTableQueryConfig<S>,
) {
  const keys = tableQueryKeys(tableId, config);
  const pageSizes = config?.pageSizes ?? TABLE_PAGE_SIZES;
  const sortKeys = columns.flatMap((column) =>
    column.sortKey ? [column.sortKey] : [],
  );
  const [state, setState] = useStudioQueryStates(
    {
      q: parseAsString.withDefault(""),
      sort: parseAsString.withDefault(config?.defaults?.sort ?? ""),
      dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault(
        config?.defaults?.dir ?? "desc",
      ),
      cursor: parseAsInteger.withDefault(0),
      pageSize: parseAsInteger.withDefault(config?.defaults?.pageSize ?? 20),
    },
    { shallow: config?.mode !== "remote", urlKeys: keys },
  );
  const search = useSearchParams();
  const [hydrated, setHydrated] = useState(false);
  const storageKey = `kortyx.table.${tableId}.query.v1`;
  // Preferences supply defaults only; explicit URL state always wins.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hydrate once for this table identity.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        void setState(
          {
            ...(!search.has(keys.sort) && sortKeys.includes(saved.sort)
              ? { sort: saved.sort }
              : {}),
            ...(!search.has(keys.dir) && ["asc", "desc"].includes(saved.dir)
              ? { dir: saved.dir }
              : {}),
            ...(!search.has(keys.pageSize) && pageSizes.includes(saved.pageSize)
              ? { pageSize: saved.pageSize }
              : {}),
          },
          { history: "replace" },
        );
      }
    } catch {
      /* Browser storage is optional. */
    }
    setHydrated(true);
  }, [storageKey]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          sort: state.sort,
          dir: state.dir,
          pageSize: state.pageSize,
        }),
      );
    } catch {
      /* Browser storage is optional. */
    }
  }, [storageKey, hydrated, state.sort, state.dir, state.pageSize]);
  const sort = sortKeys.includes(state.sort as S)
    ? (state.sort as S)
    : undefined;
  const pageSize = pageSizes.includes(state.pageSize) ? state.pageSize : 20;
  const change = (
    patch: Partial<{
      q: string | null;
      sort: string | null;
      dir: "asc" | "desc" | null;
      cursor: number | null;
      pageSize: number | null;
    }>,
  ) => setState({ ...patch, cursor: patch.cursor ?? null });
  const setSortDirection = (key: S, dir: "asc" | "desc") => {
    if (!sortKeys.includes(key)) return;
    void change({ sort: key, dir });
  };
  return {
    ...state,
    sort,
    pageSize,
    pageSizes,
    cursor: Math.max(0, state.cursor),
    keys,
    change,
    onSearch: (q: string) => {
      void change({ q: q || null });
    },
    onSort: (key: S) =>
      setSortDirection(
        key,
        sort === key && state.dir === "desc" ? "asc" : "desc",
      ),
    setSortDirection,
    clearSort: () => {
      void change({ sort: null, dir: null });
    },
  };
}
