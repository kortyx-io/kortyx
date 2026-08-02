import { describe, expect, it } from "vitest";
import {
  detailDrawerZIndex,
  detailInspectorZIndex,
  OVERLAY_LAYERS,
} from "@/lib/overlay-layers";

describe("overlay layer contract", () => {
  it("orders stacked drawers and their inspector without collisions", () => {
    const session = detailDrawerZIndex(0);
    const run = detailDrawerZIndex(1);
    const inspector = detailInspectorZIndex(run);

    expect(OVERLAY_LAYERS.detailBackdrop).toBeLessThan(session);
    expect(session).toBeLessThan(run);
    expect(run).toBeLessThan(inspector.backdrop);
    expect(inspector.backdrop).toBeLessThan(inspector.surface);
  });

  it("keeps floating controls above detail and modal surfaces", () => {
    const inspector = detailInspectorZIndex(detailDrawerZIndex(2));

    expect(OVERLAY_LAYERS.dropdown).toBeGreaterThan(inspector.surface);
    expect(OVERLAY_LAYERS.popover).toBe(OVERLAY_LAYERS.dropdown);
    expect(OVERLAY_LAYERS.dropdown).toBeGreaterThan(
      OVERLAY_LAYERS.modalSurface,
    );
    expect(OVERLAY_LAYERS.tooltip).toBeGreaterThan(OVERLAY_LAYERS.dropdown);
  });
});
