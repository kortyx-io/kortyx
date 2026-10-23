import { describe, expect, it } from "vitest";
import {
  detailDrawerZIndex,
  detailInspectorZIndex,
  OVERLAY_LAYERS,
} from "@/lib/overlay-layers";

describe("overlay layer contract", () => {
  it("keeps a page-owned parent inspector clickable below its first route child", () => {
    const pageInspector = detailInspectorZIndex(0, true);
    expect(pageInspector.backdrop).toBeLessThan(OVERLAY_LAYERS.detailBackdrop);
    expect(pageInspector.surface).toBeGreaterThan(
      OVERLAY_LAYERS.detailBackdrop,
    );
    expect(pageInspector.surface).toBeLessThan(detailDrawerZIndex(0));
  });
  it("orders stacked drawers and their inspector without collisions", () => {
    const session = detailDrawerZIndex(0);
    const run = detailDrawerZIndex(1);
    const inspector = detailInspectorZIndex(run);

    expect(OVERLAY_LAYERS.detailBackdrop).toBeLessThan(session);
    expect(session).toBeLessThan(run);
    expect(detailInspectorZIndex(session).surface).toBeLessThan(run);
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
