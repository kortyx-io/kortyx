import {
  DATA_TABLE_MIN_COLUMN_WIDTH,
  type DataTableColumn,
  type DataTableLayout,
} from "./types";

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
    ...new Set(
      Array.isArray(saved?.hidden)
        ? saved.hidden.filter((key) => keys.includes(key))
        : [],
    ),
  ];
  return {
    order,
    hidden: hidden.length === order.length ? hidden.slice(1) : hidden,
  };
}

/** Only known, finite widths can enter layout state from browser/legacy storage. */
export function columnWidths<T, S extends string>(
  columns: DataTableColumn<T, S>[],
  saved?: Record<string, number>,
) {
  return Object.fromEntries(
    columns.map((column) => {
      const value = saved?.[column.key];
      return [
        column.key,
        typeof value === "number" && Number.isFinite(value)
          ? Math.max(DATA_TABLE_MIN_COLUMN_WIDTH, value)
          : column.defaultWidth,
      ];
    }),
  );
}
