import type { DataTableColumn } from "./types";

/** Local tables can sort every data column; remote columns require an API sort key. */
export function sortableColumns<T>(
  columns: DataTableColumn<T, string>[],
  local: boolean,
): DataTableColumn<T, string>[] {
  return columns.map((column) => {
    if (!local || column.sortable === false || column.filter === false)
      return column;
    const field = Array.isArray(column.filter)
      ? column.filter[0]
      : column.filter;
    if (!field && !column.sortValue) return column;
    return {
      ...column,
      sortKey: column.sortKey ?? column.key,
      sortValue:
        column.sortValue ??
        ((row) => {
          const value = field?.read(row);
          if (Array.isArray(value))
            return value.filter((item) => item != null).join(", ");
          return typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
            ? value
            : undefined;
        }),
    };
  });
}
