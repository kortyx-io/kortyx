"use client";
import { parseAsBoolean, parseAsString } from "nuqs";
import { useStudioQueryStates } from "@/lib/nuqs";
import type { DataTableScopeFilter } from "./types";

export function useTableScope(
  fields: readonly DataTableScopeFilter[],
  server: boolean,
) {
  const keys = fields.flatMap((field) =>
    field.kind === "timeRange"
      ? [field.key, field.afterKey, field.beforeKey]
      : [field.key],
  );
  const parsers = Object.fromEntries(
    keys.map((key) => [
      key,
      fields.some((field) => field.key === key && field.kind === "boolean")
        ? parseAsBoolean
        : parseAsString,
    ]),
  );
  const [values, change] = useStudioQueryStates(parsers, { shallow: !server });
  const empty = Object.fromEntries(keys.map((key) => [key, null]));
  const hasActiveFilters = fields.some(
    (field) =>
      values[field.key] != null &&
      String(values[field.key]) !== String(field.defaultValue ?? ""),
  );
  return {
    hasActiveFilters,
    values,
    keys,
    empty,
    change,
    clear: () => {
      void change(empty);
    },
  };
}
