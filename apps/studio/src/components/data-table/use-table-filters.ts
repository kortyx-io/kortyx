"use client";
import {
  EMPTY_TABLE_FILTERS,
  matchesTableFilters,
  type TableFilters,
  TableFiltersSchema,
  validateTableFilters,
} from "@kortyx/telemetry-contracts";
import { parseAsBoolean, parseAsString } from "nuqs";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useSearchParams } from "@/lib/scoped-navigation";
import { studioFeature } from "@/usage/client";
import type { DataTableFilter } from "./types";

export type TableFilterCompatibility = {
  aliases?: Record<string, string>;
  ignoreValues?: readonly string[];
  read?: (params: Record<string, string>) => TableFilters;
  clearKeys?: readonly string[];
};

export function useTableFilters<T>({
  fields,
  keys,
  server,
  compatibility,
}: {
  fields: DataTableFilter<T>[];
  keys: { filters: string; open: string; cursor: string };
  server: boolean;
  compatibility?: TableFilterCompatibility;
}) {
  const search = useSearchParams();
  const [params, setParams] = useStudioQueryStates(
    {
      filters: parseAsString.withDefault(""),
      open: parseAsBoolean.withDefault(false),
    },
    { shallow: !server, urlKeys: { filters: keys.filters, open: keys.open } },
  );
  const aliases = compatibility?.aliases ?? {};
  let filters: TableFilters = EMPTY_TABLE_FILTERS;
  let invalid = false;
  try {
    filters = compatibility?.read
      ? compatibility.read(Object.fromEntries(search.entries()))
      : validateTableFilters(
          params.filters
            ? TableFiltersSchema.parse(JSON.parse(params.filters))
            : EMPTY_TABLE_FILTERS,
          fields,
        );
    const rules = Object.entries(aliases).flatMap(([alias, field]) => {
      const value = search.get(alias);
      return value &&
        !(compatibility?.ignoreValues ?? ["all"]).includes(value) &&
        fields.some((f) => f.key === field)
        ? [{ field, operator: "is" as const, values: [value] }]
        : [];
    });
    filters = validateTableFilters(
      { ...filters, rules: [...filters.rules, ...rules] },
      fields,
    );
  } catch {
    invalid = true;
  }
  const clearKeys = [
    ...new Set([...Object.keys(aliases), ...(compatibility?.clearKeys ?? [])]),
  ];
  const [, setAll] = useStudioQueryStates(
    {
      ...Object.fromEntries(clearKeys.map((key) => [key, parseAsString])),
      filters: parseAsString,
      cursor: parseAsString,
    },
    {
      shallow: !server,
      urlKeys: { filters: keys.filters, cursor: keys.cursor },
    },
  );
  const apply = (next: TableFilters) => {
    validateTableFilters(next, fields);
    void setAll({
      ...Object.fromEntries(clearKeys.map((key) => [key, null])),
      filters:
        next.rules.length || next.match !== "all" ? JSON.stringify(next) : null,
      cursor: null,
    });
    studioFeature("studio.filter", {
      action: "apply",
      filter: "other",
      match: next.match,
    });
  };
  return {
    filters,
    invalid,
    filterKey: keys.filters,
    open: params.open,
    setOpen: (open: boolean) => {
      void setParams({ open: open || null }, { shallow: true });
    },
    apply,
    matches: (row: T) =>
      !invalid &&
      matchesTableFilters(
        filters,
        (key) => fields.find((field) => field.key === key)?.read(row),
        fields,
      ),
  };
}
