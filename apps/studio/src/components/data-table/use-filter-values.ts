"use client";
import type { StudioTableResource } from "@kortyx/telemetry-contracts";
import { useEffect, useState } from "react";
import { useSearchParams } from "@/lib/scoped-navigation";
import { studioFetch } from "@/lib/studio-fetch";
export function useFilterValues(
  resource: StudioTableResource | "prompts" | "evaluations" | undefined,
  field: string,
  search: string,
  enabled: boolean,
) {
  const [values, setValues] = useState<string[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const params = useSearchParams();
  const scope = new URLSearchParams(
    [...params.entries()].filter(([key]) =>
      [
        "env",
        "range",
        "startedAfter",
        "startedBefore",
        "archived",
        "categoryId",
      ].includes(key),
    ),
  ).toString();
  useEffect(() => {
    if (!resource || !enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setUnavailable(false);
      studioFetch(
        `/api/studio/filter-values?${new URLSearchParams({ resource, field, search })}&${scope}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error();
          const data = await response.json();
          setValues(
            Array.isArray(data.values)
              ? data.values.filter((v: unknown) => typeof v === "string")
              : [],
          );
        })
        .catch(() => {
          if (!controller.signal.aborted) setUnavailable(true);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [resource, field, search, enabled, scope]);
  return { values, unavailable };
}
