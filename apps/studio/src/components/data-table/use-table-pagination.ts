"use client";
import { parseAsInteger } from "nuqs";
import { useStudioQueryStates } from "@/lib/nuqs";
import type { DataTablePagination } from "./types";

export const TABLE_PAGE_SIZES = [10, 20, 50, 100] as const;

/** Tables over a complete local dataset get the standard footer automatically. */
export function useTablePagination(
  tableId: string,
  provided?: DataTablePagination,
): DataTablePagination {
  const [query, setQuery] = useStudioQueryStates(
    {
      cursor: parseAsInteger.withDefault(0),
      pageSize: parseAsInteger.withDefault(20),
    },
    {
      shallow: true,
      urlKeys: {
        cursor: `tablePage.${tableId}`,
        pageSize: `tablePageSize.${tableId}`,
      },
    },
  );
  return (
    provided ?? {
      cursor: Math.max(0, query.cursor),
      pageSize: TABLE_PAGE_SIZES.includes(
        query.pageSize as (typeof TABLE_PAGE_SIZES)[number],
      )
        ? query.pageSize
        : 20,
      pageSizes: TABLE_PAGE_SIZES,
      totalCount: 0,
      onCursorChange: (cursor) => {
        void setQuery({ cursor: cursor || null });
      },
      onPageSizeChange: (pageSize) => {
        void setQuery({ pageSize, cursor: null });
      },
    }
  );
}
