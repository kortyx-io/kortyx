import type { EvalCostAmount, EvalCosts } from "@kortyx/agent/evals";
import { describe, expect, it } from "vitest";
import { sumCaseCosts } from "./cost";

function costs(amount: number, currency = "USD", complete = true): EvalCosts {
  const value: EvalCostAmount = {
    amount,
    currency,
    status: complete ? "complete" : "partial",
    calls: 1,
    unpricedCalls: complete ? 0 : 1,
    estimated: false,
  };
  return {
    workflow: { ...value },
    judge: { ...value, amount: 0 },
    total: { ...value },
  };
}
describe("repetition cost totals", () => {
  it("sums all repetitions with micro-unit precision and preserves known zero", () => {
    const result = sumCaseCosts([costs(0.1), costs(0.2)]);
    expect(result?.total).toMatchObject({
      amount: 0.3,
      currency: "USD",
      status: "complete",
      calls: 2,
    });
    expect(sumCaseCosts([costs(0), costs(0)])?.total).toMatchObject({
      amount: 0,
      status: "complete",
    });
  });
  it("does not turn missing or partial prices into a complete total", () => {
    expect(sumCaseCosts([undefined, undefined])).toBeUndefined();
    expect(sumCaseCosts([costs(0.05), undefined])?.total).toMatchObject({
      amount: 0.05,
      status: "partial",
      costSummary: { complete: false },
    });
    expect(
      sumCaseCosts([costs(0.05), costs(0.02, "USD", false)])?.total,
    ).toMatchObject({ amount: 0.07, status: "partial", unpricedCalls: 1 });
  });
  it("keeps different currencies separate without inventing a converted scalar", () => {
    const left = costs(0.03, "EUR"),
      right = costs(0.04, "USD");
    const saved = structuredClone([left, right]);
    expect(sumCaseCosts([left, right])?.total).toMatchObject({
      amount: null,
      currency: null,
      costSummary: {
        complete: true,
        amounts: [
          { amount: 0.03, currency: "EUR" },
          { amount: 0.04, currency: "USD" },
        ],
      },
    });
    expect([left, right]).toEqual(saved);
    expect(
      sumCaseCosts([left, right, undefined])?.total.costSummary?.complete,
    ).toBe(false);
  });
});
