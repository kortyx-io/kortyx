import { expect, it } from "vitest";
import { EvalCostAmountSchema } from "../src/evals/studio-contracts";

it("accepts older eval cost records and retains additive subtotal metadata", () => {
  const legacy = {
    amount: null,
    currency: null,
    status: "unavailable",
    calls: 2,
    unpricedCalls: 1,
    estimated: false,
  };
  expect(EvalCostAmountSchema.parse(legacy)).toEqual(legacy);
  const costSummary = {
    amounts: [{ amount: 0.56, currency: "USD" }],
    complete: false,
  };
  expect(
    EvalCostAmountSchema.parse({ ...legacy, costSummary }).costSummary,
  ).toEqual(costSummary);
  expect(
    EvalCostAmountSchema.safeParse({
      ...legacy,
      costSummary: {
        ...costSummary,
        amounts: [{ amount: -1, currency: "USD" }],
      },
    }).success,
  ).toBe(false);
});
