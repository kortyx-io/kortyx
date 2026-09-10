import { expect, it } from "vitest";
import {
  assertExecutionBudget,
  consumeExecutionBudget,
  createExecutionBudget,
  isExecutionLimitReached,
  restartExecutionBudget,
} from "../src/execution-limits";

it("inherits finite ceilings, ignores undefined overrides, and validates policy", () => {
  const budget = createExecutionBudget(
    { maxToolCalls: 2, maxModelPasses: 3 },
    { maxToolCalls: undefined, maxModelPasses: 4 },
  );
  expect(budget.limits).toEqual({ maxToolCalls: 2, maxModelPasses: 4 });
  for (const limits of [
    { maxToolCalls: 0 },
    { maxModelPasses: 1.5 },
    { maxChildInvocations: Infinity },
    { typo: 3 },
  ])
    expect(() => createExecutionBudget(limits as never)).toThrow();
  expect(createExecutionBudget().limits).toEqual({});
});
it("reserves actual attempts, latches exhausted limits, and gives Continue an independent allowance", () => {
  const budget = createExecutionBudget({ maxToolCalls: 1 });
  assertExecutionBudget(budget);
  consumeExecutionBudget(budget, "maxToolCalls");
  consumeExecutionBudget(budget, "maxModelPasses");
  expect(() => consumeExecutionBudget(budget, "maxToolCalls")).toThrow(
    "maxToolCalls (1/1)",
  );
  expect(budget.consumed.maxToolCalls).toBe(1);
  expect(() => consumeExecutionBudget(budget, "maxModelPasses")).toThrow(
    "maxToolCalls",
  );
  try {
    assertExecutionBudget(budget);
  } catch (error) {
    expect(isExecutionLimitReached(error)).toBe(true);
  }
  const resumed = restartExecutionBudget(budget);
  expect(resumed.limits).toEqual(budget.limits);
  expect(resumed.consumed.maxToolCalls).toBe(0);
  consumeExecutionBudget(resumed, "maxToolCalls");
  expect(budget.blocked).toBeDefined();
  expect(
    restartExecutionBudget(budget, { maxToolCalls: 3 }).limits.maxToolCalls,
  ).toBe(3);
  for (const error of [
    null,
    {},
    new Error("oops"),
    Object.assign(new Error(), { code: "OTHER" }),
  ])
    expect(isExecutionLimitReached(error)).toBe(false);
});
