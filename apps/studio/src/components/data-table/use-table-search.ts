"use client";
import { parseAsString } from "nuqs";
import { useEffect, useRef } from "react";
import { useStudioQueryStates } from "@/lib/nuqs";
import { studioFeature } from "@/usage/client";
import type { DataTableSearch } from "./types";

export function useTableSearch(
  tableId: string,
  search?: DataTableSearch,
  server = false,
) {
  const queryKey =
    search?.queryKey ??
    (search?.onChange || server ? "q" : `tableSearch.${tableId}`);
  const [params, setParams] = useStudioQueryStates(
    { q: parseAsString.withDefault("") },
    { shallow: !server, urlKeys: { q: queryKey } },
  );
  const value = search?.value ?? params.q;
  const previous = useRef(value);
  useEffect(() => {
    if (value === previous.current) return;
    const timer = setTimeout(() => {
      previous.current = value;
      studioFeature("studio.filter", { action: "apply", filter: "search" });
    }, 350);
    return () => clearTimeout(timer);
  }, [value]);
  return {
    value,
    queryKey,
    label: search?.label ?? "Search table",
    placeholder: search?.placeholder ?? "Search all columns…",
    managed: Boolean(search?.onChange) || server,
    onChange:
      search?.onChange ??
      ((q: string) => {
        void setParams({ q: q || null });
      }),
  };
}
