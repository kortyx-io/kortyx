import {
  STUDIO_TABLE_FIELDS,
  type TableFilters,
} from "@kortyx/telemetry-contracts";
import { expect, it, vi } from "vitest";
import type { DataTableFilterPanel } from "@/components/data-table/types";
import type { useRunsQuery } from "../hooks/use-runs-query";
import type { Run } from "../schema";
import { adaptQuery } from "./filter-panel-query";

function fixture(filters: TableFilters) {
  const source = {
    hasActiveFilters: false,
    setParams: vi.fn(async () => new URLSearchParams()),
  } as unknown as ReturnType<typeof useRunsQuery>;
  const panel: DataTableFilterPanel<Run> = {
    filters,
    fields: STUDIO_TABLE_FIELDS.runs.map((field) => ({
      ...field,
      read: () => undefined,
    })),
    open: true,
    onClose: vi.fn(),
    onClear: vi.fn(),
    onChange: vi.fn(),
    renderField: () => null,
    matchControl: null,
  };
  return { source, panel, query: adaptQuery(source, panel) };
}
it("restores existing Runs controls from shared URL/view filters, including zero", () => {
  const { query } = fixture({
    match: "any",
    rules: [
      { field: "status", operator: "is", values: ["failed"] },
      { field: "workflowIds", operator: "contains", values: ["workflow-x"] },
      { field: "cost", operator: "gte", values: [0] },
      { field: "durationMs", operator: "gte", values: [1500] },
    ],
  });
  expect(query.selectedStatuses).toEqual(["failed"]);
  expect(query.workflow).toBe("workflow-x");
  expect(query.minCost).toBe(0);
  expect(query.minDuration).toBe(1.5);
  expect(query.hasActiveFilters).toBe(true);
});
it("keeps a duration range as one OR condition and converts existing seconds inputs to milliseconds", async () => {
  const { query, panel } = fixture({
    match: "any",
    rules: [
      { field: "durationMs", operator: "lte", values: [3000] },
      { field: "workflowIds", operator: "contains", values: ["x"] },
    ],
  });
  await query.setParams({ minDuration: 0 });
  expect(panel.onChange).toHaveBeenCalledWith({
    match: "any",
    rules: [
      { field: "workflowIds", operator: "contains", values: ["x"] },
      { field: "durationMs", operator: "between", values: [0, 3000] },
    ],
  });
});
it("keeps scope changes independent of Match any", async () => {
  const { query, panel, source } = fixture({
    match: "any",
    rules: [{ field: "status", operator: "is", values: ["failed"] }],
  });
  await query.setParams({ range: "All time", includeChildren: true });
  expect(source.setParams).toHaveBeenCalledWith({
    range: "All time",
    includeChildren: true,
  });
  expect(panel.onChange).not.toHaveBeenCalled();
});
it("retains other fields when changing the original status and provider checkboxes", async () => {
  const { query, panel } = fixture({
    match: "all",
    rules: [
      { field: "provider", operator: "is", values: ["openai"] },
      { field: "workflowIds", operator: "contains", values: ["x"] },
    ],
  });
  await query.toggleProvider("OpenAI");
  expect(panel.onChange).toHaveBeenCalledWith(
    {
      match: "all",
      rules: [{ field: "workflowIds", operator: "contains", values: ["x"] }],
    },
    true,
  );
  await query.setParams({ status: ["completed", "failed"] });
  expect(panel.onChange).toHaveBeenLastCalledWith(
    {
      match: "all",
      rules: [
        { field: "provider", operator: "is", values: ["openai"] },
        { field: "workflowIds", operator: "contains", values: ["x"] },
        { field: "status", operator: "is", values: ["completed", "failed"] },
      ],
    },
    true,
  );
});
