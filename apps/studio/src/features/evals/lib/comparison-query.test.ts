import { expect, it } from "vitest";
import { closeComparisonQuery } from "./comparison-query";

it("closes comparison disclosures without clearing table or conversation state", () => {
  const state = closeComparisonQuery(
    new URLSearchParams({
      "expand.change-more-stats": "true",
      "expand.change-Earlier-case-expectations": "false",
      "expand.case-order-status-more-stats": "true",
      q: "shipment",
      suiteRun: "support",
    }),
  );
  expect(state["expand.change-more-stats"]).toBeNull();
  expect(state).toHaveProperty("expand.change-Earlier-case-expectations", null);
  expect(state.changeCase).toBeNull();
  expect(state).not.toHaveProperty("q");
  expect(state).not.toHaveProperty("suiteRun");
  expect(state).not.toHaveProperty("expand.case-order-status-more-stats");
});
