import type { InterruptsViewQuery } from "@/features/interrupts/hooks/use-interrupts-query";
import type { InterruptSortKey } from "@/features/interrupts/schema";
import { PAGE_SIZE, PAGE_SIZES } from "@/features/runs/lib/constants";
import {
  type ListTablePreferences,
  parseListTablePreferences,
} from "@/features/telemetry/lib/table-preferences";
import { InterruptSortKeySchema } from "../schema";

export const INTERRUPTS_TABLE_PREFERENCES_COOKIE =
  "kortyx_interrupts_table_prefs";
export const DEFAULT_INTERRUPTS_TABLE_PREFERENCES: ListTablePreferences<
  InterruptSortKey,
  InterruptsViewQuery
> = { sort: "priority", dir: "asc", pageSize: PAGE_SIZE, views: [] };
export function parseInterruptsTablePreferences(
  raw: string | undefined | null,
) {
  return parseListTablePreferences(raw, {
    sortKeys: InterruptSortKeySchema.options,
    pageSizes: PAGE_SIZES,
    isViewQuery: (value): value is InterruptsViewQuery =>
      Boolean(value && typeof value === "object"),
  });
}
