import type { DataTableLayout } from "@/components/data-table";
import { PAGE_SIZE, PAGE_SIZES } from "@/features/runs/lib/constants";
import type { SortKey } from "@/features/runs/types";

export const RUNS_TABLE_PREFERENCES_COOKIE = "kortyx_runs_table_prefs";
export const RUNS_TABLE_PREFERENCES_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const SORT_KEYS: SortKey[] = [
  "started",
  "duration",
  "tokens",
  "cost",
  "status",
];

/**
 * The full set of persistable runs-table state, bundled into a single object so
 * it can be written to one cookie (server-readable, so the first paint already
 * has the right layout) and later mirrored to the user's profile in the DB.
 * Transient filter state (search/status/env) stays in the URL and is excluded —
 * it is shareable, not a per-user default.
 */
export type RunsTablePreferences = {
  layout?: Partial<DataTableLayout>;
  sort: SortKey;
  dir: "asc" | "desc";
  pageSize: number;
};

export const DEFAULT_RUNS_TABLE_PREFERENCES: RunsTablePreferences = {
  sort: "started",
  dir: "desc",
  pageSize: PAGE_SIZE,
};

/**
 * Parse + sanitize the preferences cookie. Safe to call on the server. Returns
 * only the fields that are present and valid so invalid values never reach the
 * sort lookup or the nuqs parsers.
 */
export function parseRunsTablePreferences(
  raw: string | undefined | null,
): Partial<RunsTablePreferences> | undefined {
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;

  const value = parsed as Record<string, unknown>;
  const result: Partial<RunsTablePreferences> = {};

  if (
    typeof value.sort === "string" &&
    SORT_KEYS.includes(value.sort as SortKey)
  ) {
    result.sort = value.sort as SortKey;
  }
  if (value.dir === "asc" || value.dir === "desc") {
    result.dir = value.dir;
  }
  if (
    typeof value.pageSize === "number" &&
    (PAGE_SIZES as readonly number[]).includes(value.pageSize)
  ) {
    result.pageSize = value.pageSize;
  }
  if (value.layout && typeof value.layout === "object") {
    result.layout = value.layout as Partial<DataTableLayout>;
  }

  return result;
}

export function serializeRunsTablePreferences(
  preferences: RunsTablePreferences,
): string {
  return encodeURIComponent(JSON.stringify(preferences));
}
