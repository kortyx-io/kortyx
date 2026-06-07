import { describe, expect, it } from "vitest";
import {
  parseRemoveItemTargetId,
  toRemoveItemTargetId,
  toRemoveSectionTargetId,
} from "./removal-target-id";

describe("toRemoveItemTargetId", () => {
  it("round-trips section and item keys", () => {
    const id = toRemoveItemTargetId("pain_points", "manual_workaround");
    expect(id).toBe("pain_points__manual_workaround");
    expect(parseRemoveItemTargetId(id)).toEqual({
      sectionKey: "pain_points",
      itemKey: "manual_workaround",
    });
  });
});

describe("toRemoveSectionTargetId", () => {
  it("uses the section key directly", () => {
    expect(toRemoveSectionTargetId("core_assumption")).toBe("core_assumption");
  });
});
