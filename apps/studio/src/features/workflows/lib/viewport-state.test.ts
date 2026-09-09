import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWorkflowViewport, saveWorkflowViewport } from "./viewport-state";

afterEach(() => vi.unstubAllGlobals());
describe("tab-local workflow viewports", () => {
  it("restores a viewport independently of component remounts and keeps URLs separate", () => {
    let raw: string | null = null;
    vi.stubGlobal("sessionStorage", {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    });
    saveWorkflowViewport("workflow=a", { x: 12, y: -40, zoom: 0.8 });
    saveWorkflowViewport("workflow=b", { x: 80, y: 20, zoom: 1.2 });
    expect(loadWorkflowViewport("workflow=a")).toEqual({
      x: 12,
      y: -40,
      zoom: 0.8,
    });
    expect(loadWorkflowViewport("workflow=b")).toEqual({
      x: 80,
      y: 20,
      zoom: 1.2,
    });
    for (let i = 0; i < 25; i++)
      saveWorkflowViewport(`new=${i}`, { x: 0, y: 0, zoom: 1 });
    expect(Object.keys(JSON.parse(raw!))).toHaveLength(20);
    expect(loadWorkflowViewport("workflow=a")).toBeUndefined();
  });
  it("ignores corrupt or invalid viewports and unavailable storage", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => '{"bad":{"x":null,"y":0,"zoom":0}}',
      setItem: () => {
        throw Error("disabled");
      },
    });
    expect(loadWorkflowViewport("bad")).toBeUndefined();
    expect(() =>
      saveWorkflowViewport("x", { x: 0, y: 0, zoom: 1 }),
    ).not.toThrow();
    vi.stubGlobal("sessionStorage", { getItem: () => "{" });
    expect(loadWorkflowViewport("bad")).toBeUndefined();
  });
});
