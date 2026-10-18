import { describe, expect, it } from "vitest";
import {
  aggregateCost,
  averageCostSummary,
  UNKNOWN_COST,
  ZERO_MODEL_COST,
} from "../src/pricing/aggregate-cost";

const priced = {
  cost: 0.56,
  currency: "USD",
  pricingStatus: "priced" as const,
  pricingSource: "default-rate-card" as const,
};

describe("known model cost subtotals", () => {
  it("retains the priced part of an incomplete run and nested session exactly once", () => {
    const run = aggregateCost([priced, UNKNOWN_COST]);
    expect(run).toMatchObject({
      cost: null,
      pricingStatus: "unpriced",
      costSummary: {
        amounts: [{ amount: 0.56, currency: "USD" }],
        complete: false,
      },
    });
    const session = aggregateCost([run, priced, ZERO_MODEL_COST]);
    expect(session.costSummary).toEqual({
      amounts: [{ amount: 1.12, currency: "USD" }],
      complete: false,
    });
  });
  it("never confuses an unknown cost with a confirmed zero", () => {
    expect(aggregateCost([UNKNOWN_COST]).costSummary).toEqual({
      amounts: [],
      complete: false,
    });
    expect(aggregateCost([ZERO_MODEL_COST]).costSummary).toEqual({
      amounts: [{ amount: 0, currency: null }],
      complete: true,
    });
    expect(aggregateCost([ZERO_MODEL_COST, UNKNOWN_COST]).costSummary).toEqual({
      amounts: [{ amount: 0, currency: null }],
      complete: false,
    });
  });
  it("keeps known amounts separate for mixed currencies", () => {
    const result = aggregateCost([
      priced,
      { ...priced, currency: "EUR", cost: 1 },
      ZERO_MODEL_COST,
    ]);
    expect(result.cost).toBeNull();
    expect(result.costSummary).toEqual({
      amounts: [
        { amount: 1, currency: "EUR" },
        { amount: 0.56, currency: "USD" },
      ],
      complete: true,
    });
  });
  it("reports a lower bound per run using all runs as the denominator", () => {
    expect(
      averageCostSummary(aggregateCost([priced, UNKNOWN_COST]).costSummary, 2),
    ).toEqual({
      amounts: [{ amount: 0.28, currency: "USD" }],
      complete: false,
    });
  });
});
