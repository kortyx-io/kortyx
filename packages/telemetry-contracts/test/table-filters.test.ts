import { describe, expect, it } from "vitest";
import {
  matchesTableFilters,
  matchesTableRule,
  readStudioTableFilters,
  type TableFilterDefinition,
  type TableFilters,
  TableFiltersSchema,
  validateTableFilters,
} from "../src/table-filters";

const fields: TableFilterDefinition[] = [
  { key: "status", label: "Status", kind: "enum" },
  { key: "cost", label: "Cost", kind: "number" },
  { key: "started", label: "Started", kind: "date" },
];
describe("table filter semantics", () => {
  it("combines conditions with all/any while keeping each numeric range atomic", () => {
    const filters: TableFilters = {
      match: "all",
      rules: [
        { field: "status", operator: "is", values: ["failed", "cancelled"] },
        { field: "cost", operator: "between", values: [0, 1] },
      ],
    };
    const read = (key: string) => (key === "status" ? "completed" : 0);
    expect(matchesTableFilters(filters, read)).toBe(false);
    expect(matchesTableFilters({ ...filters, match: "any" }, read)).toBe(true);
    expect(matchesTableRule(2, filters.rules[1]!)).toBe(false);
    expect(matchesTableRule("FAILED", filters.rules[0]!)).toBe(true);
  });
  it("uses literal contains for arrays and requires explicit missing-value filters", () => {
    expect(
      matchesTableRule(["agent_%", "other"], {
        field: "x",
        operator: "contains",
        values: ["_%"],
      }),
    ).toBe(true);
    expect(
      matchesTableRule(["agent"], {
        field: "x",
        operator: "contains",
        values: ["_%"],
      }),
    ).toBe(false);
    expect(
      matchesTableRule(null, {
        field: "x",
        operator: "isNot",
        values: ["failed"],
      }),
    ).toBe(false);
    expect(
      matchesTableRule([null, ""], {
        field: "x",
        operator: "missing",
        values: [],
      }),
    ).toBe(true);
    expect(
      matchesTableRule(false, { field: "x", operator: "present", values: [] }),
    ).toBe(true);
    expect(
      matchesTableRule(0, { field: "x", operator: "is", values: [0] }),
    ).toBe(true);
  });
  it("rejects unknown fields, mismatched operators, invalid bounds and excess rules", () => {
    expect(() =>
      validateTableFilters(
        {
          match: "all",
          rules: [{ field: "secret", operator: "contains", values: ["x"] }],
        },
        fields,
      ),
    ).toThrow();
    expect(() =>
      validateTableFilters(
        {
          match: "all",
          rules: [{ field: "cost", operator: "contains", values: ["1"] }],
        },
        fields,
      ),
    ).toThrow();
    expect(() =>
      validateTableFilters(
        {
          match: "all",
          rules: [{ field: "cost", operator: "between", values: [5, 1] }],
        },
        fields,
      ),
    ).toThrow();
    expect(() =>
      validateTableFilters(
        {
          match: "all",
          rules: [{ field: "cost", operator: "gte", values: ["1"] }],
        },
        fields,
      ),
    ).toThrow();
    expect(
      TableFiltersSchema.safeParse({
        match: "all",
        rules: Array.from({ length: 33 }, () => ({
          field: "status",
          operator: "is",
          values: ["failed"],
        })),
      }).success,
    ).toBe(false);
  });
  it("uses explicit UTC bounds and round-trips a same-day date range", () => {
    const filters: TableFilters = {
      match: "all",
      rules: [
        {
          field: "started",
          operator: "between",
          values: ["2026-10-15T00:00:00.000Z", "2026-10-15T23:59:59.999Z"],
        },
      ],
    };
    validateTableFilters(filters, fields);
    expect(matchesTableFilters(filters, () => "2026-10-15T12:00:00Z")).toBe(
      true,
    );
    expect(matchesTableFilters(filters, () => "2026-10-16T00:00:00Z")).toBe(
      false,
    );
    expect(() =>
      validateTableFilters(
        {
          match: "all",
          rules: [
            { field: "started", operator: "gte", values: ["2026-10-15T12:00"] },
          ],
        },
        fields,
      ),
    ).toThrow();
  });
  it("keeps date equality distinct from literal text equality", () => {
    const filters: TableFilters = {
      match: "all",
      rules: [
        { field: "started", operator: "is", values: ["2026-10-15T12:00:00Z"] },
      ],
    };
    expect(
      matchesTableFilters(filters, () => "2026-10-15T14:00:00+02:00", fields),
    ).toBe(true);
    expect(
      matchesTableFilters(filters, () => "2026-10-15T14:00:00+02:00", [
        { key: "started", label: "Text", kind: "text" },
      ]),
    ).toBe(false);
    expect(
      readStudioTableFilters(
        { error: "true", workflow: "partial" },
        "interrupts",
      ).rules,
    ).toEqual(
      expect.arrayContaining([
        { field: "resumeError", operator: "present", values: [] },
        { field: "workflowId", operator: "contains", values: ["partial"] },
      ]),
    );
  });
  it("preserves old link/view aliases, including zero thresholds and seconds-to-ms conversion", () => {
    const filters = readStudioTableFilters(
      {
        status: "failed,cancelled",
        workflow: "workflow-x",
        minDuration: "1.5",
        maxCost: "0",
      },
      "runs",
    );
    expect(filters.rules).toEqual(
      expect.arrayContaining([
        { field: "status", operator: "is", values: ["failed", "cancelled"] },
        { field: "workflowIds", operator: "is", values: ["workflow-x"] },
        { field: "durationMs", operator: "gte", values: [1500] },
        { field: "cost", operator: "lte", values: [0] },
      ]),
    );
    expect(
      readStudioTableFilters(
        { workflow: "x", version: "v1", provider: "OpenRouter" },
        "sessions",
      ).rules.map((r) => r.field),
    ).toEqual(
      expect.arrayContaining(["workflowIds", "activeVersion", "providers"]),
    );
    expect(
      readStudioTableFilters(
        { error: "true", fork: "false" },
        "sessions",
      ).rules.map((r) => r.field),
    ).toEqual(expect.arrayContaining(["hasError", "hasFork"]));
  });
});
