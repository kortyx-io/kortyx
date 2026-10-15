import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("../src/repositories/evaluations", () => ({
  listEvaluations: vi.fn(async (_db, _scope, options) =>
    state.rows.slice(
      options.scan.offset,
      options.scan.offset + options.scan.limit,
    ),
  ),
}));

import type { TelemetryDb } from "../src/client";
import { listEvaluationTable } from "../src/repositories/evaluation-table";

const scope = { organizationId: "org-a", projectId: "project-a" };
beforeEach(() => {
  state.rows = Array.from({ length: 125 }, (_, index) => ({
    id: `evaluation-${index}`,
    name: index === 124 ? "Old evaluation" : "Recent evaluation",
    status: index % 2 ? "passed" : "failed",
    createdAt: new Date(Date.UTC(2026, 9, 15, 0, 0, -index)).toISOString(),
    targetId: "app-a",
    targetName: "Application",
    environment: "test",
    metadata: { source: "studio" },
    counts: {
      passed: index % 2 ? 1 : 0,
      failed: index % 2 ? 0 : 1,
      error: 0,
      cancelled: 0,
    },
  }));
});
describe("evaluation table", () => {
  it("filters and suggests across history older than the first 100 evaluations", async () => {
    const result = await listEvaluationTable({} as TelemetryDb, scope, {
      tableFilters: JSON.stringify({
        match: "all",
        rules: [{ field: "name", operator: "contains", values: ["Old"] }],
      }),
      field: "name",
      search: "Old",
    });
    expect(result.totalCount).toBe(1);
    expect(result.runs.map((run) => run.id)).toEqual(["evaluation-124"]);
    expect(result.values).toEqual(["Old evaluation"]);
  });
  it("counts before paginating and returns stable matches under any", async () => {
    const result = await listEvaluationTable({} as TelemetryDb, scope, {
      tableFilters: JSON.stringify({
        match: "any",
        rules: [
          { field: "status", operator: "is", values: ["passed"] },
          { field: "name", operator: "contains", values: ["Old"] },
        ],
      }),
      cursor: "1",
      pageSize: "2",
    });
    expect(result.totalCount).toBe(63);
    expect(result.runs.map((run) => run.id)).toEqual([
      "evaluation-3",
      "evaluation-5",
    ]);
  });
  it("rejects arbitrary field access and malformed numeric comparisons", async () => {
    await expect(
      listEvaluationTable({} as TelemetryDb, scope, { field: "request" }),
    ).rejects.toThrow("Unknown evaluation filter field");
    await expect(
      listEvaluationTable({} as TelemetryDb, scope, {
        tableFilters: JSON.stringify({
          match: "all",
          rules: [{ field: "cost", operator: "gte", values: ["raw text"] }],
        }),
      }),
    ).rejects.toThrow("Invalid evaluation filters");
  });
});
