import { describe, expect, it } from "vitest";
import type { CurrentDiscoveryCanvasContext } from "@/lib/runtime-context";
import {
  canvasHasContent,
  formatDiscoveryCanvasForChat,
  serializeDiscoveryCanvasForPrompt,
} from "./serialize-canvas";

const fullDiscoveryCanvas: CurrentDiscoveryCanvasContext = {
  intro: {
    label: "Product brief",
    summary: "Captures the product idea, target user, and discovery goal.",
    item_text: "Summarize the product idea and discovery goal.",
  },
  sections: {
    core_assumption: {
      section_label: "Core Assumption",
      section_summary: "Clarify the riskiest belief",
      section_rationale: "Determines what the team should validate first",
      section_type: "assumption",
      items: {
        user_pull: {
          item_text: "Do users already try to solve this problem manually?",
          item_rationale: "Checks whether the problem has visible pull",
        },
      },
    },
  },
};

describe("canvasHasContent", () => {
  it("returns false for missing or empty canvass", () => {
    expect(canvasHasContent(undefined)).toBe(false);
    expect(canvasHasContent({})).toBe(false);
    expect(
      canvasHasContent({
        intro: { label: "", summary: "", item_text: "" },
      }),
    ).toBe(false);
    expect(canvasHasContent({ sections: {} })).toBe(false);
  });

  it("returns true when intro has content", () => {
    expect(
      canvasHasContent({
        intro: { label: "", summary: "", item_text: "Hi" },
      }),
    ).toBe(true);
  });

  it("returns true when any section exists", () => {
    const coreAssumption = fullDiscoveryCanvas.sections?.core_assumption;
    if (!coreAssumption) throw new Error("test fixture broken");
    expect(
      canvasHasContent({
        sections: { core_assumption: coreAssumption },
      }),
    ).toBe(true);
  });
});

describe("serializeDiscoveryCanvasForPrompt", () => {
  it("emits one path-prefixed line per editable field", () => {
    const out = serializeDiscoveryCanvasForPrompt(fullDiscoveryCanvas);
    expect(out).toContain("intro.label :: Product brief");
    expect(out).toContain(
      "intro.summary :: Captures the product idea, target user, and discovery goal.",
    );
    expect(out).toContain(
      "intro.item_text :: Summarize the product idea and discovery goal.",
    );
    expect(out).toContain(
      "sections.core_assumption.section_label :: Core Assumption",
    );
    expect(out).toContain(
      "sections.core_assumption.items.user_pull.item_text :: Do users already try to solve this problem manually?",
    );
  });

  it("orders sections using their insertion order", () => {
    const coreAssumption = fullDiscoveryCanvas.sections?.core_assumption;
    if (!coreAssumption) throw new Error("test fixture broken");
    const canvas: CurrentDiscoveryCanvasContext = {
      sections: { zeta: coreAssumption, alpha: coreAssumption },
    };
    const out = serializeDiscoveryCanvasForPrompt(canvas);
    const zetaIdx = out.indexOf("[zeta]");
    const alphaIdx = out.indexOf("[alpha]");
    expect(zetaIdx).toBeGreaterThan(-1);
    expect(alphaIdx).toBeGreaterThan(zetaIdx);
  });

  it("renders empty canvases without crashing", () => {
    expect(serializeDiscoveryCanvasForPrompt({})).toBe("");
  });
});

describe("formatDiscoveryCanvasForChat", () => {
  it("includes labels but no path notation", () => {
    const out = formatDiscoveryCanvasForChat(fullDiscoveryCanvas);
    expect(out).toContain("Product brief title: Product brief");
    expect(out).toContain(
      "Product brief description: Captures the product idea, target user, and discovery goal.",
    );
    expect(out).toContain(
      "Intake item: Summarize the product idea and discovery goal.",
    );
    expect(out).toContain("[core_assumption] Core Assumption");
    expect(out).not.toContain("sections.core_assumption");
  });

  it("returns an empty string for an empty canvas", () => {
    expect(formatDiscoveryCanvasForChat({})).toBe("");
  });
});
