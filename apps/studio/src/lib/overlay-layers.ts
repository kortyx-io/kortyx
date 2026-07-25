/**
 * Shared z-index contract for portalled and detail UI.
 *
 * Detail drawers can stack dynamically, so inspectors are positioned relative
 * to their owning drawer. Floating controls use a separate, intentionally high
 * band so a menu or tooltip opened inside any supported drawer depth remains
 * above that surface.
 */
export const OVERLAY_LAYERS = {
  detailBackdrop: 45,
  detailDrawerBase: 50,
  detailDrawerStep: 10,
  inspectorBackdropOffset: 5,
  inspectorSurfaceOffset: 10,
  modalBackdrop: 400,
  modalSurface: 410,
  dropdown: 1_000,
  popover: 1_000,
  tooltip: 1_100,
} as const;

export function detailDrawerZIndex(index: number) {
  return (
    OVERLAY_LAYERS.detailDrawerBase +
    Math.max(0, index) * OVERLAY_LAYERS.detailDrawerStep
  );
}

export function detailInspectorZIndex(drawerZIndex: number) {
  return {
    backdrop: drawerZIndex + OVERLAY_LAYERS.inspectorBackdropOffset,
    surface: drawerZIndex + OVERLAY_LAYERS.inspectorSurfaceOffset,
  };
}
