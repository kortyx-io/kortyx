import { PAGE_SIZE, PAGE_SIZES } from "@/features/runs/lib/constants";
import type { SessionsViewQuery } from "@/features/sessions/hooks/use-sessions-query";
import type { SessionSortKey } from "@/features/sessions/schema";
import {
  type ListTablePreferences,
  parseListTablePreferences,
} from "@/features/telemetry/lib/table-preferences";

export const SESSIONS_TABLE_PREFERENCES_COOKIE = "kortyx_sessions_table_prefs";
export const DEFAULT_SESSIONS_TABLE_PREFERENCES: ListTablePreferences<
  SessionSortKey,
  SessionsViewQuery
> = { sort: "activity", dir: "desc", pageSize: PAGE_SIZE, views: [] };
export function parseSessionsTablePreferences(raw: string | undefined | null) {
  return parseListTablePreferences(raw, {
    sortKeys: ["activity", "duration", "tokens", "cost", "runs", "status"],
    pageSizes: PAGE_SIZES,
    isViewQuery: (value): value is SessionsViewQuery =>
      Boolean(value && typeof value === "object"),
  });
}
