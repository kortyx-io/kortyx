"use client";
import {
  EMPTY_TABLE_FILTERS,
  LEGACY_TABLE_FILTERS,
  matchesTableFilters,
  readStudioTableFilters,
  type StudioTableResource,
  type TableFilters,
  TableFiltersSchema,
  validateTableFilters,
} from "@kortyx/telemetry-contracts";
import { parseAsBoolean, parseAsString } from "nuqs";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useSearchParams } from "@/lib/scoped-navigation";
import { studioFeature } from "@/usage/client";
import type { DataTableFilter } from "./types";
export function useTableFilters<T>({
  tableId,
  fields,
  resource,
  cursorKey,
}: {
  tableId: string;
  fields: DataTableFilter<T>[];
  resource?: StudioTableResource | "prompts" | "evaluations";
  cursorKey?: string;
}) {
  const search = useSearchParams();
  const filterKey = resource ? "tableFilters" : `tableFilters.${tableId}`;
  const [params, setParams] = useStudioQueryStates(
    {
      filters: parseAsString.withDefault(""),
      open: parseAsBoolean.withDefault(false),
    },
    {
      shallow: !resource,
      urlKeys: {
        filters: filterKey,
        open: resource ? "filterPanel" : `filterPanel.${tableId}`,
      },
    },
  );
  const localAliases: Record<string, string> =
    tableId === "eval-cases"
      ? { outcome: "status" }
      : tableId === "eval-comparison"
        ? { change: "change" }
        : tableId.startsWith("prompt-")
          ? {
              [tableId === "prompt-runs"
                ? "promptrunsStatus"
                : "promptevalsStatus"]: "status",
            }
          : { status: "status", application: "applicationId" };
  let filters: TableFilters = EMPTY_TABLE_FILTERS;
  let invalid = false;
  try {
    filters =
      resource && resource !== "prompts" && resource !== "evaluations"
        ? readStudioTableFilters(Object.fromEntries(search.entries()), resource)
        : validateTableFilters(
            params.filters
              ? TableFiltersSchema.parse(JSON.parse(params.filters))
              : EMPTY_TABLE_FILTERS,
            fields,
          );
    if (!resource || resource === "evaluations") {
      const rules = Object.entries(localAliases).flatMap(([alias, field]) => {
        const value = search.get(alias);
        return value && value !== "all" && fields.some((f) => f.key === field)
          ? [{ field, operator: "is" as const, values: [value] }]
          : [];
      });
      filters = { ...filters, rules: [...filters.rules, ...rules] };
    }
  } catch {
    invalid = true;
  }
  const apply = (next: TableFilters) => {
    const aliases = Object.fromEntries(
      (resource && resource !== "prompts" && resource !== "evaluations"
        ? Object.keys(LEGACY_TABLE_FILTERS)
        : Object.keys(localAliases)
      ).map((key) => [key, null]),
    );
    // nuqs' clearOnDefault handles removal; aliases use an explicit query update below.
    // setQueryStates supports extra, dynamically named parsers for old links.
    void setAll({
      filters:
        next.rules.length || next.match !== "all" ? JSON.stringify(next) : null,
      cursor: null,
      ...aliases,
    });
    studioFeature("studio.filter", {
      action: "apply",
      filter: "other",
      match: next.match,
    });
  };
  const dynamicParsers = Object.fromEntries(
    [
      ...new Set([
        ...Object.keys(LEGACY_TABLE_FILTERS),
        ...Object.keys(localAliases),
      ]),
    ].map((key) => [key, parseAsString]),
  );
  const [, setAll] = useStudioQueryStates(
    { ...dynamicParsers, filters: parseAsString, cursor: parseAsString },
    {
      shallow: !resource,
      urlKeys: {
        filters: filterKey,
        ...(tableId === "prompt-runs"
          ? { cursor: "promptrunsPage" }
          : tableId === "prompt-evals"
            ? { cursor: "promptevalsPage" }
            : {}),
        ...(cursorKey ? { cursor: cursorKey } : {}),
      },
    },
  );
  return {
    filters,
    invalid,
    filterKey,
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
