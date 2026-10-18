import {
  LEGACY_TABLE_FILTERS,
  readStudioTableFilters,
  type StudioTableResource,
} from "@kortyx/telemetry-contracts";
import type { DataTableScopeFilter } from "@/components/data-table/types";
import type { TableFilterCompatibility } from "@/components/data-table/use-table-filters";

export const operationalScopeFilters: readonly DataTableScopeFilter[] = [
  {
    kind: "timeRange",
    key: "range",
    label: "Time range",
    afterKey: "startedAfter",
    beforeKey: "startedBefore",
    defaultValue: "24 hours",
  },
  {
    kind: "text",
    key: "env",
    label: "Environment",
    placeholder: "All environments",
  },
];
export const runsScopeFilters: readonly DataTableScopeFilter[] = [
  ...operationalScopeFilters,
  { kind: "boolean", key: "includeChildren", label: "Include child workflows" },
];
export const studioFilterCompatibility = (
  resource: StudioTableResource,
): TableFilterCompatibility => ({
  read: (params) => readStudioTableFilters(params, resource),
  clearKeys: Object.keys(LEGACY_TABLE_FILTERS),
});
