import { describe, expect, it } from "vitest";
import { costDisplay } from "./cost";

describe("Studio cost display", () => {
  it("shows available amounts with only a plus and puts the caveat in the note", () => {
    const display = costDisplay({
      cost: null,
      pricingStatus: "unpriced",
      costSummary: {
        amounts: [{ amount: 0.56, currency: "USD" }],
        complete: false,
      },
    });
    expect(display.label).toBe("$0.56+");
    expect(display.note).toContain("actual cost may be higher");
  });
  it("distinguishes an empty subtotal from confirmed zero usage", () => {
    expect(costDisplay({ cost: null, pricingStatus: "unknown" })).toMatchObject(
      { label: "$0.00+" },
    );
    expect(costDisplay({ cost: 0, pricingStatus: "priced" }).label).toBe(
      "$0.00",
    );
    expect(costDisplay({ cost: null }).note).toContain(
      "actual cost is unknown",
    );
  });
  it("preserves known costs from older API responses", () => {
    expect(costDisplay({ cost: 12.5, currency: "EUR" }).label).toBe("€12.50");
  });
  it("shows different currencies separately instead of hiding or adding them", () => {
    const display = costDisplay({
      costSummary: {
        amounts: [
          { amount: 1, currency: "USD" },
          { amount: 2, currency: "EUR" },
        ],
        complete: false,
      },
    });
    expect(display.label).toBe("$1.00+ / €2.00+");
    expect(display.note).toContain("without conversion");
  });
});
