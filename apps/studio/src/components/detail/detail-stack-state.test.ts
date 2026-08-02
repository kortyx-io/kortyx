import { describe, expect, it } from "vitest";
import {
  closeAllDetailLayers,
  closeDetailLayersAbove,
  expandDetailLayer,
  getDetailBackdropState,
  isDetailLayerActiveForHistory,
  registerDetailLayer,
  setDetailLayerClosing,
  setDetailLayerSplitOpen,
  syncDetailLayersToHistoryPath,
} from "./detail-stack-state";

const session = {
  dismissPath: "/sessions",
  id: "/sessions/session-1",
  matchPath: "/sessions/session-1",
};
const run = {
  dismissPath: "/runs",
  id: "/runs/run-1",
  matchPath: "/runs/run-1",
};

describe("detail stack transitions", () => {
  it("keeps soft-navigated entities in registration order", () => {
    const withSession = registerDetailLayer([], session);
    const withRun = registerDetailLayer(withSession, run);

    expect(withRun.map((layer) => layer.id)).toEqual([session.id, run.id]);
    expect(withRun.every((layer) => !layer.closing)).toBe(true);
  });

  it("expands only the selected layer in a stack", () => {
    const layers = registerDetailLayer(registerDetailLayer([], session), run);

    const expanded = expandDetailLayer(layers, run.id);

    expect(expanded.map((layer) => layer.expanded)).toEqual([false, true]);
  });

  it("does not shrink an expanded parent when its child closes", () => {
    const layers = expandDetailLayer(
      expandDetailLayer(
        registerDetailLayer(registerDetailLayer([], session), run),
        session.id,
      ),
      run.id,
    );

    const closing = setDetailLayerClosing(layers, run.id, true);

    expect(closing[0]).toMatchObject({
      id: session.id,
      closing: false,
      expanded: true,
    });
    expect(closing[1]).toMatchObject({
      id: run.id,
      closing: true,
      expanded: true,
    });
  });

  it("tracks an inspector split on its owning entity layer", () => {
    const layers = registerDetailLayer(registerDetailLayer([], session), run);
    const split = setDetailLayerSplitOpen(layers, run.id, true);

    expect(split.map((layer) => layer.splitOpen)).toEqual([false, true]);
  });

  it("closes only layers above a clicked ancestor", () => {
    const layers = registerDetailLayer(registerDetailLayer([], session), run);

    const closing = closeDetailLayersAbove(layers, session.id);

    expect(closing.map((layer) => layer.closing)).toEqual([false, true]);
  });

  it("can close the entire stack from the shared backdrop", () => {
    const layers = registerDetailLayer(registerDetailLayer([], session), run);

    expect(closeAllDetailLayers(layers).map((layer) => layer.closing)).toEqual([
      true,
      true,
    ]);
  });

  it("closes the top layer when history returns to an ancestor", () => {
    const layers = registerDetailLayer(registerDetailLayer([], session), run);

    expect(
      syncDetailLayersToHistoryPath(layers, session.matchPath).map(
        (layer) => layer.closing,
      ),
    ).toEqual([false, true]);
  });

  it("closes the full stack when history returns to a list", () => {
    const layers = registerDetailLayer(registerDetailLayer([], session), run);

    expect(
      syncDetailLayersToHistoryPath(layers, "/sessions").map(
        (layer) => layer.closing,
      ),
    ).toEqual([true, true]);
  });

  it("reopens retained layers when history moves forward", () => {
    const layers = closeAllDetailLayers(
      registerDetailLayer(registerDetailLayer([], session), run),
    );

    expect(
      syncDetailLayersToHistoryPath(layers, run.matchPath).map(
        (layer) => layer.closing,
      ),
    ).toEqual([false, false]);
  });

  it("retains ancestors while history opens a no-longer-registered child", () => {
    const layers = registerDetailLayer([], session);

    expect(
      syncDetailLayersToHistoryPath(layers, run.matchPath, [
        session.dismissPath,
        run.dismissPath,
      ]).map((layer) => layer.closing),
    ).toEqual([false]);
    expect(
      isDetailLayerActiveForHistory(
        layers,
        session.dismissPath,
        run.matchPath,
        [session.dismissPath, run.dismissPath],
      ),
    ).toBe(true);
  });

  it("does not retain a drawer when history returns to a list", () => {
    const layers = registerDetailLayer([], session);

    expect(
      isDetailLayerActiveForHistory(
        layers,
        session.dismissPath,
        session.dismissPath,
        [session.dismissPath, run.dismissPath],
      ),
    ).toBe(false);
  });

  it("keeps the backdrop visible when multiple children close to an ancestor", () => {
    const interrupt = {
      dismissPath: "/interrupts",
      id: "/interrupts/interrupt-1",
      matchPath: "/interrupts/interrupt-1",
    };
    const layers = closeDetailLayersAbove(
      registerDetailLayer(
        registerDetailLayer(registerDetailLayer([], session), run),
        interrupt,
      ),
      session.id,
    );

    expect(getDetailBackdropState(layers)).toEqual({
      activeCount: 1,
      topActiveExpanded: false,
      topIndex: 0,
      zIndex: 45,
    });
  });

  it("disables the modal backdrop when the top stacked layer is expanded", () => {
    const layers = expandDetailLayer(
      registerDetailLayer(registerDetailLayer([], session), run),
      run.id,
    );

    expect(getDetailBackdropState(layers)).toMatchObject({
      activeCount: 2,
      topActiveExpanded: true,
      topIndex: 1,
      zIndex: 45,
    });
  });

  it("keeps the shared backdrop behind every interactive drawer layer", () => {
    const layers = registerDetailLayer(registerDetailLayer([], session), run);

    expect(getDetailBackdropState(layers)).toMatchObject({
      activeCount: 2,
      topIndex: 1,
      zIndex: 45,
    });
  });
});
