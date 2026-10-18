import type { DataTableColumn } from "./types";

/** Sort a copy and retain input order for equal or missing values. */
export function sortTableRows<T, S extends string>(
  rows: T[],
  columns: DataTableColumn<T, S>[],
  sort: S | undefined,
  direction: "asc" | "desc",
) {
  const column = columns.find((column) => column.sortKey === sort);
  if (!sort || !column) return rows;
  const field = Array.isArray(column.filter) ? column.filter[0] : column.filter;
  const read = column.sortValue ?? (field ? field.read : undefined);
  if (!read) return rows;
  return [...rows].sort((a, b) => {
    const left = read(a),
      right = read(b);
    if (left == null || left === "")
      return right == null || right === "" ? 0 : 1;
    if (right == null || right === "") return -1;
    const delta =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), undefined, {
            numeric: true,
          });
    return direction === "asc" ? delta : -delta;
  });
}
