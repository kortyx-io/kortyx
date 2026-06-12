import { describe, expect, it } from "vitest";
import type { CurrentDiscoveryCanvasContext } from "@/lib/runtime-context";
import { readDiscoveryCanvasPath } from "./read-path";

const canvas: CurrentDiscoveryCanvasContext = {
  intro: {
    label: "Product brief",
    summary: "Opening context for the discovery canvas.",
    item_text: "Welcome!",
  },
  sections: {
    user_segment: {
      section_label: "User Segment",
      section_summary: "Who has the problem",
      section_rationale: "Frames the discovery scope",
      section_type: "user_segment",
      items: {
        target_user: {
          item_text: "Identify the primary user segment",
          item_rationale: "Keeps interviews focused",
        },
      },
    },
  },
};

describe("readDiscoveryCanvasPath", () => {
  it("reads top-level fields", () => {
    expect(readDiscoveryCanvasPath(canvas, "intro.label")).toBe(
      "Product brief",
    );
    expect(readDiscoveryCanvasPath(canvas, "intro.summary")).toBe(
      "Opening context for the discovery canvas.",
    );
    expect(readDiscoveryCanvasPath(canvas, "intro.item_text")).toBe("Welcome!");
  });

  it("reads nested section fields", () => {
    expect(
      readDiscoveryCanvasPath(canvas, "sections.user_segment.section_label"),
    ).toBe("User Segment");
  });

  it("reads nested item fields", () => {
    expect(
      readDiscoveryCanvasPath(
        canvas,
        "sections.user_segment.items.target_user.item_text",
      ),
    ).toBe("Identify the primary user segment");
  });

  it("returns undefined for missing segments", () => {
    expect(readDiscoveryCanvasPath(canvas, "intro.missing")).toBeUndefined();
    expect(
      readDiscoveryCanvasPath(canvas, "sections.nonexistent.section_label"),
    ).toBeUndefined();
  });

  it("returns undefined when the cursor hits a non-object before the leaf", () => {
    expect(
      readDiscoveryCanvasPath(canvas, "intro.item_text.too.deep"),
    ).toBeUndefined();
  });
});
