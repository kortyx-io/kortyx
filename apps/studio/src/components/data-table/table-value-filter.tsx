"use client";

import type { TableFilters } from "@kortyx/telemetry-contracts";
import { createContext, type ReactNode, useContext } from "react";

type ValueFilter = {
  filters: TableFilters;
  fields: readonly { key: string; label: string; kind: string }[];
  apply: (filters: TableFilters) => void;
};
export const TableValueFilterContext = createContext<ValueFilter | null>(null);

export function toggleTableValue(
  filters: TableFilters,
  field: string,
  value: string,
): TableFilters {
  const current = filters.rules.filter((rule) => rule.field === field);
  const currentRule = current[0];
  const selected =
    current.length === 1 &&
    currentRule?.operator === "is" &&
    currentRule.values.length === 1 &&
    currentRule.values[0] === value;
  return {
    ...filters,
    rules: [
      ...filters.rules.filter((rule) => rule.field !== field),
      ...(selected
        ? []
        : [{ field, operator: "is" as const, values: [value] }]),
    ],
  };
}

/** Status chips remain plain text outside a table with the corresponding filter. */
export function TableValueFilter({
  value,
  children,
  field = "status",
}: {
  value: string;
  children: ReactNode;
  field?: string;
}) {
  const context = useContext(TableValueFilterContext);
  const definition = context?.fields.find(
    (item) => item.key === field && item.kind === "enum",
  );
  if (!context || !definition) return children;
  const rules = context.filters.rules.filter((rule) => rule.field === field);
  const currentRule = rules[0];
  const selected =
    rules.length === 1 &&
    currentRule?.operator === "is" &&
    currentRule.values.length === 1 &&
    currentRule.values[0] === value;
  return (
    <button
      type="button"
      aria-label={`Filter ${definition.label}: ${value}`}
      aria-pressed={selected}
      className="flex max-w-full min-w-0 items-center justify-start text-left hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      onClick={(event) => {
        event.stopPropagation();
        context.apply(toggleTableValue(context.filters, field, value));
      }}
    >
      {children}
    </button>
  );
}
