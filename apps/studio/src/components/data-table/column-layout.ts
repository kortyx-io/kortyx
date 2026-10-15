import type { DataTableColumn, DataTableLayout } from "./types";

/** Retain known columns in their saved order and append newly introduced columns. */
export function columnLayout<T, S extends string>(
  columns: DataTableColumn<T, S>[],
  saved?: Partial<DataTableLayout>,
) {
  const keys = columns.map((column) => column.key);
  const previous = Array.isArray(saved?.order) ? saved.order : [];
  const order = [
    ...new Set(previous.filter((key) => keys.includes(key))),
    ...keys.filter((key) => !previous.includes(key)),
  ];
  const hidden = [
    ...new Set([
      ...(Array.isArray(saved?.hidden)
        ? saved.hidden.filter((key) => keys.includes(key))
        : []),
      ...columns
        .filter(
          (column) =>
            column.defaultHidden &&
            (!saved?.hidden || !previous.includes(column.key)),
        )
        .map((column) => column.key),
    ]),
  ];
  return { order, hidden };
}
