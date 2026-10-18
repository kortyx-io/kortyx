import type {
  TableFilterKind,
  TableFilterValue,
} from "@kortyx/telemetry-contracts";
import type { DataTableFilter } from "./types";
export function columnFilter<T>(
  key: string,
  label: string,
  kind: TableFilterKind,
  read: (row: T) => TableFilterValue | readonly TableFilterValue[],
  options?: readonly string[],
): DataTableFilter<T> {
  return { key, label, kind, read, options };
}
