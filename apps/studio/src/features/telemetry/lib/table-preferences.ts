import type { DataTableLayout } from "@/components/data-table";

export type SavedListView<Q> = {
  id: string;
  name: string;
  query: Q;
  layout: DataTableLayout;
};

export type ListTablePreferences<S extends string, Q> = {
  layout?: Partial<DataTableLayout>;
  sort: S;
  dir: "asc" | "desc";
  pageSize: number;
  views: SavedListView<Q>[];
};

export const LIST_TABLE_PREFERENCES_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseListTablePreferences<S extends string, Q>(
  raw: string | undefined | null,
  options: {
    sortKeys: readonly S[];
    pageSizes: readonly number[];
    isViewQuery: (value: unknown) => value is Q;
  },
): Partial<ListTablePreferences<S, Q>> | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const value = parsed as Record<string, unknown>;
  const result: Partial<ListTablePreferences<S, Q>> = {};
  if (
    typeof value.sort === "string" &&
    options.sortKeys.includes(value.sort as S)
  )
    result.sort = value.sort as S;
  if (value.dir === "asc" || value.dir === "desc") result.dir = value.dir;
  if (
    typeof value.pageSize === "number" &&
    options.pageSizes.includes(value.pageSize)
  )
    result.pageSize = value.pageSize;
  if (value.layout && typeof value.layout === "object")
    result.layout = value.layout as Partial<DataTableLayout>;
  if (Array.isArray(value.views)) {
    result.views = value.views.flatMap((view): SavedListView<Q>[] => {
      if (!view || typeof view !== "object") return [];
      const item = view as Record<string, unknown>;
      if (
        typeof item.id !== "string" ||
        typeof item.name !== "string" ||
        !options.isViewQuery(item.query) ||
        !item.layout ||
        typeof item.layout !== "object"
      )
        return [];
      return [
        {
          id: item.id,
          name: item.name,
          query: item.query,
          layout: item.layout as DataTableLayout,
        },
      ];
    });
  }
  return result;
}

export function serializeListTablePreferences<S extends string, Q>(
  preferences: ListTablePreferences<S, Q>,
) {
  return encodeURIComponent(JSON.stringify(preferences));
}
