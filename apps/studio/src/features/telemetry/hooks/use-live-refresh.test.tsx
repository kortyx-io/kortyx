// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useLiveRefresh } from "./use-live-refresh";

vi.mock("@/lib/scoped-navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/studio-route-provider", () => ({
  useStudioRouteScope: () => ({ sampleProject: false }),
}));
vi.mock("@/usage/client", () => ({
  studioFeature: vi.fn(),
  studioOperation: () => ({ end: vi.fn(), fail: vi.fn() }),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("reopens and reconciles live updates when navigation changes the selected evaluation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const sources: { onopen: (() => void) | null; closed: boolean }[] = [];
  vi.stubGlobal(
    "EventSource",
    class {
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      closed = false;
      constructor() {
        sources.push(this);
      }
      addEventListener() {}
      close() {
        this.closed = true;
      }
    },
  );
  const reads: string[] = [];
  const root = createRoot(document.createElement("div"));
  function View({ id }: { id: string }) {
    const live = useLiveRefresh({
      enabled: true,
      resource: "evals",
      refreshKey: id,
      refreshOnEnable: false,
      refresh: async () => {
        reads.push(id);
      },
    });
    return <output>{live.status}</output>;
  }
  try {
    await act(async () => root.render(<View id="first" />));
    expect(sources).toHaveLength(1);
    await act(async () => sources[0]?.onopen?.());
    expect(reads).toEqual(["first"]);
    await act(async () => root.render(<View id="second" />));
    expect(sources[0]?.closed).toBe(true);
    expect(sources).toHaveLength(2);
    await act(async () => sources[1]?.onopen?.());
    expect(reads).toEqual(["first", "second"]);
  } finally {
    await act(async () => root.unmount());
  }
});
