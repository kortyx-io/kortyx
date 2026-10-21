import type { EvalCosts } from "@kortyx/agent/evals";
import { expect, it } from "vitest";
import { conversationStatTrend } from "./conversation-stat-trends";
import type { ChangeSide, ConversationChange } from "./evaluation-changes";

const cost = (amount: number, currency = "USD"): EvalCosts => {
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
const side = (
  statuses: string[],
  durationMs: number,
  amount: number,
): ChangeSide => ({
  total: statuses.length,
  passed: statuses.filter((s) => s === "passed").length,
  repetitions: statuses.map((status, index) => ({
    repetition: index + 1,
    status,
  })),
  durationMs,
  costs: cost(amount),
});
const row = (): ConversationChange => ({
  key: "case",
  caseId: "case",
  name: "Case",
  suiteId: "suite",
  suiteName: "Suite",
  kind: "improved",
  label: "Now passing",
  earlier: side(["passed", "failed"], 4000, 0.02),
  current: side(["passed", "passed"], 3000, 0.03),
});
it("identifies improvement and deterioration with absolute amounts in each metric's unit", () => {
  const value = row();
  expect(conversationStatTrend(value, "passRate")).toMatchObject({
    delta: 50,
    unit: "percent",
    improvement: true,
  });
  expect(conversationStatTrend(value, "failed")).toMatchObject({
    delta: -1,
    improvement: true,
  });
  expect(conversationStatTrend(value, "duration")).toMatchObject({
    delta: -1000,
    improvement: true,
  });
  expect(conversationStatTrend(value, "meanDuration")).toMatchObject({
    delta: -500,
    improvement: true,
  });
  expect(conversationStatTrend(value, "cost")?.delta).toBeCloseTo(0.01);
  expect(conversationStatTrend(value, "cost")).toMatchObject({
    improvement: false,
    currency: "USD",
  });
  expect(conversationStatTrend(value, "meanCost")?.delta).toBeCloseTo(0.005);
  expect(conversationStatTrend(value, "cancelled")).toMatchObject({
    delta: 0,
    improvement: null,
  });
});
it("keeps volume changes neutral and compares per-repetition performance when counts differ", () => {
  const value = row();
  value.current = side(["passed"], 1500, 0.015);
  expect(conversationStatTrend(value, "duration")).toMatchObject({
    delta: -2500,
    improvement: null,
  });
  expect(conversationStatTrend(value, "cost")).toMatchObject({
    improvement: null,
  });
  expect(conversationStatTrend(value, "passed")).toMatchObject({
    delta: 0,
    improvement: null,
  });
  expect(conversationStatTrend(value, "meanDuration")).toMatchObject({
    delta: -500,
    improvement: true,
  });
  expect(conversationStatTrend(value, "meanCost")).toMatchObject({
    improvement: false,
  });
});
it("withholds deltas for changed/incomplete context, missing timings, partial prices and different currencies", () => {
  const value = row();
  value.kind = "review";
  for (const metric of ["passRate", "duration", "cost"] as const)
    expect(conversationStatTrend(value, metric)).toBeUndefined();
  value.kind = "improved";
  delete value.current.durationMs;
  expect(conversationStatTrend(value, "duration")).toBeUndefined();
  value.current.costs = cost(0.03, "EUR");
  expect(conversationStatTrend(value, "cost")).toBeUndefined();
  value.current.costs = cost(0.03);
  value.current.costs.total.status = "partial";
  expect(conversationStatTrend(value, "meanCost")).toBeUndefined();
  expect(conversationStatTrend(value, "passRate")).toMatchObject({ delta: 50 });
});
