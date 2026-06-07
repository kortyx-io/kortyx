import { describe, expect, it } from "vitest";
import {
  addSectionOpSchema,
  canvasOpSchema,
  removeSectionOpSchema,
  setOpSchema,
  UPDATE_OP_KINDS,
  updateTargetSchema,
} from "./canvas-ops";

describe("UPDATE_OP_KINDS", () => {
  it("matches the workflow's branch conditions", () => {
    // Locked in to catch silent drift between the classifier output
    // and the `{ when }` edges in update-canvas-workflow.ts.
    expect(UPDATE_OP_KINDS).toEqual([
      "update_field",
      "add_section",
      "remove_section",
      "add_item",
      "remove_item",
    ]);
  });
});

describe("setOpSchema", () => {
  it("accepts a canonical set patch", () => {
    const op = {
      op: "set" as const,
      path: "intro.item_text",
      value: "Hello!",
      label: "Intro item",
      reason: "Punchier opener",
    };
    expect(setOpSchema.parse(op)).toEqual(op);
  });

  it("rejects empty paths and labels", () => {
    expect(() =>
      setOpSchema.parse({
        op: "set",
        path: "",
        value: "x",
        label: "L",
        reason: "R",
      }),
    ).toThrow();
    expect(() =>
      setOpSchema.parse({
        op: "set",
        path: "p",
        value: "x",
        label: "",
        reason: "R",
      }),
    ).toThrow();
  });
});

describe("addSectionOpSchema", () => {
  it("requires a full section payload", () => {
    const op = {
      op: "addSection" as const,
      sectionKey: "counterparty_risk",
      section: {
        section_label: "Core Assumption",
        section_summary: "Clarify the riskiest belief",
        section_rationale: "Determines what the team should validate first",
        section_type: "assumption" as const,
        items: {
          user_pull: {
            item_text: "Do users already try to solve this problem manually?",
            item_rationale: "Checks whether the problem has visible pull",
          },
        },
      },
      label: '"Core Assumption"',
      reason: "Critical for discovery",
    };
    expect(addSectionOpSchema.parse(op)).toEqual(op);
  });
});

describe("removeSectionOpSchema", () => {
  it("only needs a sectionKey + shared fields", () => {
    expect(
      removeSectionOpSchema.parse({
        op: "removeSection",
        sectionKey: "leadership",
        label: '"Leadership"',
        reason: "User asked",
      }),
    ).toMatchObject({ op: "removeSection", sectionKey: "leadership" });
  });
});

describe("canvasOpSchema discriminated union", () => {
  it("routes by `op` discriminator", () => {
    const setOp = canvasOpSchema.parse({
      op: "set",
      path: "p",
      value: "v",
      label: "L",
      reason: "R",
    });
    expect(setOp.op).toBe("set");

    const removeOp = canvasOpSchema.parse({
      op: "removeItem",
      sectionKey: "c",
      itemKey: "q",
      label: "L",
      reason: "R",
    });
    expect(removeOp.op).toBe("removeItem");
  });

  it("rejects unknown ops", () => {
    expect(() =>
      canvasOpSchema.parse({
        op: "transmute",
        sectionKey: "c",
        label: "L",
        reason: "R",
      }),
    ).toThrow();
  });
});

describe("updateTargetSchema", () => {
  it("requires a path, instruction, and label", () => {
    expect(
      updateTargetSchema.parse({
        path: "intro.item_text",
        instruction: "Make it warmer",
        label: "Intro item",
      }),
    ).toMatchObject({ path: "intro.item_text" });

    expect(() =>
      updateTargetSchema.parse({
        path: "",
        instruction: "x",
        label: "y",
      }),
    ).toThrow();
  });
});
