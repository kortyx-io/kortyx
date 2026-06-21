import { useCallback, useEffect, useRef, useState } from "react";
import {
  LIST_TABLE_PREFERENCES_COOKIE_MAX_AGE,
  type ListTablePreferences,
  serializeListTablePreferences,
} from "@/features/telemetry/lib/table-preferences";

export function useListTablePreferences<S extends string, Q>({
  cookieName,
  defaults,
  initial,
}: {
  cookieName: string;
  defaults: ListTablePreferences<S, Q>;
  initial?: Partial<ListTablePreferences<S, Q>>;
}) {
  const [value, setValue] = useState<ListTablePreferences<S, Q>>(() => ({
    ...defaults,
    ...initial,
  }));
  const current = useRef(value);
  const save = useCallback(
    (patch: Partial<ListTablePreferences<S, Q>>) => {
      const next = { ...current.current, ...patch };
      if (JSON.stringify(next) === JSON.stringify(current.current)) return;
      current.current = next;
      setValue(next);
      // biome-ignore lint/suspicious/noDocumentCookie: preference cookie is read by the matching server route
      document.cookie = `${cookieName}=${serializeListTablePreferences(next)}; path=/; max-age=${LIST_TABLE_PREFERENCES_COOKIE_MAX_AGE}; samesite=lax`;
    },
    [cookieName],
  );
  useEffect(() => {
    current.current = value;
  }, [value]);
  return { value, save };
}
