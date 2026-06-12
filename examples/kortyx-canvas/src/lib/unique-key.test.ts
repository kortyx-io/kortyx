import { describe, expect, it } from "vitest";
import { ensureUniqueKey } from "./unique-key";

describe("ensureUniqueKey", () => {
  it("returns the candidate when there is no collision", () => {
    expect(ensureUniqueKey("communication_skills", [])).toBe(
      "communication_skills",
    );
    expect(
      ensureUniqueKey("communication_skills", ["leadership", "negotiation"]),
    ).toBe("communication_skills");
  });

  it("suffixes _2 on the first collision", () => {
    expect(
      ensureUniqueKey("communication_skills", ["communication_skills"]),
    ).toBe("communication_skills_2");
  });

  it("keeps incrementing until a free name is found", () => {
    expect(
      ensureUniqueKey("communication_skills", [
        "communication_skills",
        "communication_skills_2",
        "communication_skills_3",
      ]),
    ).toBe("communication_skills_4");
  });

  it("skips gaps in the existing numbering", () => {
    // We append _2, _3, ... sequentially regardless of whether the existing
    // set has a higher number with a gap. Documenting current behavior.
    expect(ensureUniqueKey("foo", ["foo", "foo_2", "foo_5"])).toBe("foo_3");
  });
});
