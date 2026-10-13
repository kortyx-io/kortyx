import { expect, it } from "vitest";
import { evalCostLabel } from "./eval-cost";

it("uses the same numeric incomplete marker for all eval cost states", () => {
  const amount = {
    amount: 0.0012,
    currency: "USD",
    calls: 1,
    unpricedCalls: 1,
    estimated: false,
  };
  expect(evalCostLabel({ ...amount, status: "partial" })).toBe("$0.0012+");
  expect(evalCostLabel({ ...amount, status: "complete" })).toBe("$0.0012");
  expect(
    evalCostLabel({ ...amount, amount: null, status: "unavailable" }),
  ).toBe("$0.00+");
  expect(evalCostLabel()).toBe("$0.00+");
  expect(
    evalCostLabel({
      ...amount,
      amount: null,
      status: "unavailable",
      costSummary: {
        amounts: [
          { amount: 0.001, currency: "EUR" },
          { amount: 0.00025, currency: "USD" },
        ],
        complete: true,
      },
    }),
  ).toBe("€0.001 / $0.00025");
});
