import {
  LEGACY_TABLE_FILTERS,
  type TableFilterRule,
} from "@kortyx/telemetry-contracts";
import type { DataTableFilterPanel } from "@/components/data-table/types";
import type { useRunsQuery } from "../hooks/use-runs-query";
import type { Run, RunStatus } from "../schema";

export function readBound(
  panel: DataTableFilterPanel<Run>,
  field: string,
  maximum = false,
) {
  const rules = panel.filters.rules.filter((rule) => rule.field === field);
  const value =
    rules.find((rule) => rule.operator === "between")?.values[
      maximum ? 1 : 0
    ] ??
    rules.find((rule) =>
      maximum
        ? ["lte", "lt"].includes(rule.operator)
        : ["gte", "gt"].includes(rule.operator),
    )?.values[0];
  return value === undefined
    ? undefined
    : Number(value) / (field === "durationMs" ? 1000 : 1);
}
export function changeBound(
  panel: DataTableFilterPanel<Run>,
  field: string,
  maximum: boolean,
  value: number | undefined,
) {
  const min = maximum ? readBound(panel, field) : value;
  const max = maximum ? value : readBound(panel, field, true);
  const scale = field === "durationMs" ? 1000 : 1;
  const rule: TableFilterRule[] =
    min !== undefined && max !== undefined
      ? [{ field, operator: "between", values: [min * scale, max * scale] }]
      : min !== undefined
        ? [{ field, operator: "gte", values: [min * scale] }]
        : max !== undefined
          ? [{ field, operator: "lte", values: [max * scale] }]
          : [];
  panel.onChange({
    ...panel.filters,
    rules: [
      ...panel.filters.rules.filter((rule) => rule.field !== field),
      ...rule,
    ],
  });
}
export function adaptQuery(
  source: ReturnType<typeof useRunsQuery>,
  panel: DataTableFilterPanel<Run>,
): ReturnType<typeof useRunsQuery> {
  const values = (key: string) =>
    panel.filters.rules.find((rule) => rule.field === key)?.values ?? [];
  const text = (key: string) => String(values(key)[0] ?? "");
  const selectedStatuses = values("status").map(String) as RunStatus[];
  const selectedProviders = values("provider").map(String);
  const setParams: typeof source.setParams = (changes) => {
    const scope: Parameters<typeof source.setParams>[0] = {};
    let rules = [...panel.filters.rules];
    let changed = false,
      immediate = false;
    for (const [key, value] of Object.entries(changes)) {
      const mapping =
        LEGACY_TABLE_FILTERS[key as keyof typeof LEGACY_TABLE_FILTERS];
      if (!mapping) {
        Object.assign(scope, { [key]: value });
        continue;
      }
      const [field, operator] = mapping;
      if (!panel.fields.some((item) => item.key === field)) continue;
      if (["minCost", "minDuration", "minTokens"].includes(key)) {
        changeBound(
          { ...panel, filters: { ...panel.filters, rules } },
          field,
          false,
          value === null || value === undefined ? undefined : Number(value),
        );
        return Promise.resolve(new URLSearchParams());
      }
      rules = rules.filter((rule) => rule.field !== field);
      if (
        value !== null &&
        value !== undefined &&
        value !== "" &&
        (!Array.isArray(value) || value.length)
      )
        rules.push({
          field,
          operator:
            field === "toolName"
              ? "is"
              : ["workflowIds", "path"].includes(field)
                ? "contains"
                : operator,
          values: Array.isArray(value) ? value : [value],
        });
      changed = true;
      if (
        Array.isArray(value) ||
        typeof value === "boolean" ||
        ["provider", "status", "toolOutcome", "toolMode"].includes(key)
      )
        immediate = true;
    }
    if (changed) panel.onChange({ ...panel.filters, rules }, immediate);
    return Object.keys(scope).length
      ? source.setParams(scope)
      : Promise.resolve(new URLSearchParams());
  };
  return {
    ...source,
    selectedStatuses,
    selectedProviders,
    toolOnly: values("hasTool")[0] === true,
    workflow: text("workflowIds"),
    path: text("path"),
    session: text("sessionId"),
    model: text("models"),
    result: text("result"),
    toolName: text("toolName"),
    toolOutcome: text("toolOutcome"),
    toolMode: text("toolMode"),
    minCost: readBound(panel, "cost") ?? 0,
    minTokens: readBound(panel, "tokens") ?? 0,
    minDuration: readBound(panel, "durationMs") ?? 0,
    activeFilterCount: panel.filters.rules.length,
    hasActiveFilters: panel.filters.rules.length > 0 || source.hasActiveFilters,
    setParams,
    toggleStatus: (status) =>
      setParams({
        status: selectedStatuses.includes(status)
          ? selectedStatuses.filter((value) => value !== status)
          : [...selectedStatuses, status],
      }),
    toggleProvider: (provider) =>
      setParams({
        provider: selectedProviders.some(
          (value) => value.toLowerCase() === provider.toLowerCase(),
        )
          ? selectedProviders.filter(
              (value) => value.toLowerCase() !== provider.toLowerCase(),
            )
          : [...selectedProviders, provider],
      }),
  };
}
