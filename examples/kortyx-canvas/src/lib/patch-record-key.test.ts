import { describe, expect, it } from "vitest";
import type { DiscoveryCanvasOp } from "@/schemas/canvas-ops";
import {
  buildLlmPatchStreamFields,
  listPatchPayloadEntries,
  patchesRecordFromOps,
  toPatchRecordKey,
  toStructuralPatchRecordKey,
} from "./patch-record-key";

describe("toPatchRecordKey", () => {
  it("replaces dots so structured paths stay object-keyed", () => {
    expect(toPatchRecordKey("intro.item_text")).toBe("intro__item_text");
    expect(toPatchRecordKey("sections.core_assumption.section_label")).toBe(
      "sections__core_assumption__section_label",
    );
  });
});

describe("buildLlmPatchStreamFields", () => {
  it("emits named record paths, not numeric array segments", () => {
    expect(buildLlmPatchStreamFields(["intro.item_text", "title"])).toEqual({
      "patches.intro__item_text": "set",
      "patches.intro__item_text.value": "text-delta",
      "patches.title": "set",
      "patches.title.value": "text-delta",
    });
  });
});

describe("patchesRecordFromOps", () => {
  it("keys structural ops by stable names", () => {
    const op: DiscoveryCanvasOp = {
      op: "removeItem",
      sectionKey: "core_assumption",
      itemKey: "user_pull",
      label: "Item",
      reason: "User asked",
    };
    expect(patchesRecordFromOps([op])).toEqual({
      removeItem__core_assumption__user_pull: op,
    });
    expect(toStructuralPatchRecordKey(op)).toBe(
      "removeItem__core_assumption__user_pull",
    );
  });
});

describe("listPatchPayloadEntries", () => {
  it("reads record-shaped patch payloads", () => {
    expect(
      listPatchPayloadEntries({
        patches: {
          intro__item_text: {
            path: "intro.item_text",
            value: "Hello",
          },
        },
      }),
    ).toEqual([
      {
        key: "intro__item_text",
        entry: { path: "intro.item_text", value: "Hello" },
      },
    ]);
  });
});
