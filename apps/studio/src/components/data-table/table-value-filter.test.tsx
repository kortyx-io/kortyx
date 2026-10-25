import type { TableFilters } from "@kortyx/telemetry-contracts";
import { expect, it } from "vitest";
import { toggleTableValue } from "./table-value-filter";

it("replaces a status condition while retaining unrelated filters and match mode", () => {
  const initial: TableFilters = {
    match: "any",
    rules: [
      { field: "environment", operator: "is", values: ["staging"] },
      { field: "status", operator: "isNot", values: ["passed"] },
    ],
  };
  const filtered = toggleTableValue(initial, "status", "failed");
  expect(filtered).toEqual({
    match: "any",
    rules: [
      initial.rules[0],
      { field: "status", operator: "is", values: ["failed"] },
    ],
  });
  expect(toggleTableValue(filtered, "status", "failed")).toEqual({
    match: "any",
    rules: [initial.rules[0]],
  });
  expect(initial.rules[1].operator).toBe("isNot");
});
