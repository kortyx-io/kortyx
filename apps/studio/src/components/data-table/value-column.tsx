import type {
  TableFilterKind,
  TableFilterValue,
} from "@kortyx/telemetry-contracts";
import type { DataTableColumn, DataTableFilter } from "./types";

export function valueColumn<T, S extends string = never>({
  key,
  label,
  read,
  kind = "text",
  format,
  filter,
  width = 160,
}: {
  key: string;
  label: string;
  read: DataTableFilter<T>["read"];
  kind?: TableFilterKind;
  format?: (value: Exclude<TableFilterValue, null | undefined>) => string;
  filter?: DataTableFilter<T>;
  width?: number;
}): DataTableColumn<T, S> {
  return {
    key,
    label,
    defaultWidth: width,
    filter: filter ?? { key, label, kind, read },
    render: (row) => {
      const value = read(row);
      const text = (Array.isArray(value) ? value : [value])
        .filter((item) => item !== null && item !== undefined && item !== "")
        .map((item) => (format ? format(item!) : String(item)))
        .join(", ");
      return (
        <span
          className="block truncate text-xs text-muted-foreground"
          title={text || undefined}
        >
          {text || "—"}
        </span>
      );
    },
  };
}
