import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  DEFAULT_RUNS_TABLE_PREFERENCES,
  RUNS_TABLE_PREFERENCES_COOKIE_MAX_AGE,
  type RunsTablePreferences,
  serializeRunsTablePreferences,
} from "@/features/runs/lib/table-preferences";

type UseRunsTablePreferencesOptions = {
  cookieName: string;
  /**
   * Server-provided preferences (read from the cookie in the RSC). Authoritative
   * and hydration-safe, so these seed the query defaults and initial layout.
   */
  initial?: Partial<RunsTablePreferences>;
  /**
   * Durable persistence seam (e.g. a debounced server action writing to the
   * user's profile). The cookie cache is written here regardless.
   */
  onPersist?: (preferences: RunsTablePreferences) => void;
  /** Debounce window for `onPersist`. Defaults to 600ms. */
  debounceMs?: number;
  maxAge?: number;
};

/**
 * Single owner of all persistable runs-table state (layout + sort + dir +
 * pageSize) at the page level.
 *
 * - `value` merges server `initial` over the defaults — pass it to
 *   `useRunsQuery` (sort/dir/pageSize) and `DataTableProvider#initialLayout`.
 * - `save(patch)` merges the change, writes it to a cookie synchronously (so the
 *   next server render paints the correct layout with no flash), and debounces
 *   `onPersist` for the durable DB write.
 */
export function useRunsTablePreferences({
  cookieName,
  initial,
  onPersist,
  debounceMs = 600,
  maxAge = RUNS_TABLE_PREFERENCES_COOKIE_MAX_AGE,
}: UseRunsTablePreferencesOptions) {
  const value = useMemo<RunsTablePreferences>(
    () => ({ ...DEFAULT_RUNS_TABLE_PREFERENCES, ...initial }),
    [initial],
  );

  const currentRef = useRef(value);
  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const save = useCallback(
    (patch: Partial<RunsTablePreferences>) => {
      const next = { ...currentRef.current, ...patch };
      if (JSON.stringify(next) === JSON.stringify(currentRef.current)) return;
      currentRef.current = next;

      // biome-ignore lint/suspicious/noDocumentCookie: small client-side preference cookie, read server-side to avoid a layout flash
      document.cookie = `${cookieName}=${serializeRunsTablePreferences(next)}; path=/; max-age=${maxAge}; samesite=lax`;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(
        () => onPersistRef.current?.(next),
        debounceMs,
      );
    },
    [cookieName, maxAge, debounceMs],
  );

  return { value, save };
}
