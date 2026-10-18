import type { DataTableFilter } from "./types";

/** Search all declared data fields, including hidden columns, before local pagination. */
export function matchesTableSearch<T>(
  row: T,
  fields: DataTableFilter<T>[],
  query: string,
) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return fields.some((field) => {
    const value = field.read(row);
    return (Array.isArray(value) ? value : [value]).some(
      (item) =>
        item !== null &&
        item !== undefined &&
        String(item).toLocaleLowerCase().includes(needle),
    );
  });
}
