import type { EvalCosts } from "@kortyx/agent/evals";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readSampleDataset } from "@/features/sample-project/data";
import {
  type CaseRow,
  type ComparisonRow,
  caseRows,
  compareRuns,
} from "./presentation";
import { repetitionStatTrend } from "./repetition-stat-trends";

const costs = (amount: number, currency = "USD"): EvalCosts => {
  const value = {
    amount,
    currency,
    status: "complete" as const,
    calls: 1,
    unpricedCalls: 0,
    estimated: false,
  };
  return { workflow: value, judge: value, total: value };
};
const row = (): ComparisonRow => ({
  id: "case",
  name: "Case",
  change: "unchanged",
  baseline: [{ durationMs: 1000, costs: costs(0.01) } as CaseRow],
  candidate: [{ durationMs: 3000, costs: costs(0.03) } as CaseRow],
});
it("compares the selected executions' actual duration and cost without averaging or summing", () => {
  const value = row();
  expect(repetitionStatTrend(value, "duration")).toMatchObject({
    delta: 2000,
    improvement: false,
  });
  expect(repetitionStatTrend(value, "total")?.delta).toBeCloseTo(0.02);
  value.candidate[0].durationMs = 500;
  value.candidate[0].costs = costs(0.005);
  expect(repetitionStatTrend(value, "duration")).toMatchObject({
    delta: -500,
    improvement: true,
  });
  expect(repetitionStatTrend(value, "workflow")?.delta).toBeCloseTo(-0.005);
  value.candidate.push(value.candidate[0]);
  expect(repetitionStatTrend(value, "total")).toBeUndefined();
});
it("withholds deltas for incompatible context, missing durations, incomplete or different-currency prices", () => {
  const value = row();
  value.change = "changed";
  expect(repetitionStatTrend(value, "total")).toBeUndefined();
  value.change = "unchanged";
  delete value.candidate[0].durationMs;
  expect(repetitionStatTrend(value, "duration")).toBeUndefined();
  value.candidate[0].costs = costs(0.03, "EUR");
  expect(repetitionStatTrend(value, "judge")).toBeUndefined();
  value.candidate[0].costs = costs(0.03);
  value.candidate[0].costs.total.status = "partial";
  expect(repetitionStatTrend(value, "total")).toBeUndefined();
});
it("a missing result in another repetition does not invalidate a completed matching selected pair", () => {
  const suite = structuredClone(
    readSampleDataset().evals.evaluations[0].results.run.suites[0],
  );
  const chosen = caseRows(suite).find((item) => item.status === "passed");
  if (!chosen || !suite.request || !suite.result)
    throw new Error("Missing completed fixture");
  const other = structuredClone(suite);
  other.request!.repetitions = 2;
  const overall = compareRuns(suite, other).find(
    (item) => item.id === chosen.caseId,
  );
  expect(overall?.change).toBe("incomplete");
  const selected = compareRuns(suite, other, {
    baseline: [chosen],
    candidate: [chosen],
  }).find((item) => item.id === chosen.caseId);
  expect(selected?.change).toBe("unchanged");
  expect(repetitionStatTrend(selected, "duration")).toMatchObject({ delta: 0 });
});
