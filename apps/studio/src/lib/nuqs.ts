"use client";

import { parseAsBoolean, useQueryState, useQueryStates } from "nuqs";
import { useCallback, useTransition } from "react";

// App-wide nuqs defaults. Browser Back/Forward should step through URL-backed
// UI state—filters, sorting, pagination, panels, tabs and selections—instead of
// unexpectedly leaving the current surface. Callers may override an option for
// exceptional internal updates such as canonicalization.
const DEFAULTS = {
  history: "push",
  scroll: false,
  shallow: false,
} as const;

// biome-ignore lint/suspicious/noExplicitAny: preserves nuqs' generic inference at call sites
export const useStudioQueryStates = ((parsers: any, options?: any) => {
  const [, startTransition] = useTransition();
  return useQueryStates(parsers, {
    ...DEFAULTS,
    startTransition,
    ...options,
  });
}) as typeof useQueryStates;

// nuqs folds options into the parser argument for useQueryState.
// biome-ignore lint/suspicious/noExplicitAny: thin passthrough; the cast restores nuqs' typed signature
export const useStudioQueryState = ((key: any, parser?: any, options?: any) => {
  const [, startTransition] = useTransition();
  return useQueryState(key, {
    ...parser,
    ...DEFAULTS,
    startTransition,
    ...options,
  });
}) as typeof useQueryState;

/** URL param for list-page filter side panels (`?filterPanel=true`). */
export const filterPanelParser = parseAsBoolean.withDefault(false);

const detailUiParamKeys = [
  "filterPanel",
  "tab",
  "trace",
  "event",
  "detailView",
] as const;

/**
 * Persist actual list filters, sorting and pagination when navigating to an
 * entity, while dropping transient UI state from the previous detail surface.
 */
export function detailNavigationHref(
  pathname: string,
  searchParams: Pick<URLSearchParams, "toString">,
) {
  const next = new URLSearchParams(searchParams.toString());
  for (const key of detailUiParamKeys) next.delete(key);
  const query = next.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

export function filterPanelParamChanges(open: boolean) {
  return { filterPanel: open ? true : null };
}

type SetFilterPanel = (
  values: ReturnType<typeof filterPanelParamChanges>,
  options?: { shallow?: boolean },
) => Promise<URLSearchParams>;

/** Open/close helpers for the shared `filterPanel` search param. */
export function useFilterPanelState(
  open: boolean,
  setQueryStates: SetFilterPanel,
) {
  const setFiltersOpen = useCallback(
    (next: boolean) =>
      setQueryStates(filterPanelParamChanges(next), { shallow: true }),
    [setQueryStates],
  );

  const toggleFiltersOpen = useCallback(() => {
    void setFiltersOpen(!open);
  }, [open, setFiltersOpen]);

  return { filtersOpen: open, setFiltersOpen, toggleFiltersOpen };
}
