import { describe, expect, it } from "vitest";
import { describeOpForSummary } from "./describe-op-for-summary";

describe("describeOpForSummary", () => {
  it("surfaces the action verb per op kind", () => {
    expect(
      describeOpForSummary({
        op: "set",
        path: "p",
        value: "v",
        label: "Intro item",
        reason: "R",
      }),
    ).toBe("Updated Intro item");

    expect(
      describeOpForSummary({
        op: "addSection",
        sectionKey: "c",
        section: {
          section_label: "Core Assumption",
          section_summary: "x",
          section_rationale: "x",
          section_type: "assumption",
          items: {},
        },
        label: '"Core Assumption"',
        reason: "R",
      }),
    ).toBe('Added new section "Core Assumption"');

    expect(
      describeOpForSummary({
        op: "removeItem",
        sectionKey: "c",
        itemKey: "q",
        label: 'Item 1 of "Core Assumption"',
        reason: "R",
      }),
    ).toBe('Removed Item 1 of "Core Assumption"');
  });
});
