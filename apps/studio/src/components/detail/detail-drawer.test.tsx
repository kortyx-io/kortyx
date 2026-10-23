// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { studioPathname } from "@/lib/studio-routing";
import { DetailDrawer, DetailDrawerHost } from "./detail-drawer";
import { DETAIL_MOTION_DURATION_MS } from "./detail-motion";
import { DetailStackProvider } from "./detail-stack";

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ isMobile: false, state: "expanded" }),
}));
vi.mock("@/lib/scoped-navigation", () => ({
  usePathname: () => studioPathname(window.location.pathname),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/nuqs", async (original) => ({
  ...(await original<typeof import("@/lib/nuqs")>()),
  useStudioQueryStates: () => [{ detailView: "drawer" }, vi.fn()],
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function render(path?: string) {
  await act(() =>
    root.render(
      <DetailStackProvider>
        <DetailDrawerHost>
          {path ? (
            <DetailDrawer
              matchPath={path}
              dismissPath="/runs"
              title={path}
              description="Recorded run"
            >
              <p>Saved payload for {path}</p>
            </DetailDrawer>
          ) : null}
        </DetailDrawerHost>
      </DetailStackProvider>,
    ),
  );
}
async function settle() {
  await act(() => vi.advanceTimersByTimeAsync(DETAIL_MOTION_DURATION_MS * 3));
}
async function restore(path: string, state: unknown) {
  await act(() => {
    window.history.replaceState(state, "", path);
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });
}
const drawer = (path: string) =>
  container.querySelector(`[data-detail-drawer="${path}"]`);

it("retains the mounted ancestor when Next releases its parallel slot", async () => {
  window.history.replaceState({}, "", "/runs/first");
  await render("/runs/first");
  const original = drawer("/runs/first");
  expect(original).not.toBeNull();
  window.history.replaceState({}, "", "/sessions/parent");
  await render();
  await settle();
  expect(drawer("/runs/first")).toBe(original);
  expect(original?.getAttribute("data-state")).toBe("open");
});

it("revives an unmounted payload from history when Next restores an empty slot", async () => {
  window.history.replaceState({}, "", "/runs/first");
  await render("/runs/first");
  const saved = window.history.state;
  await restore("/runs", {});
  await render();
  await settle();
  expect(drawer("/runs/first")).toBeNull();
  await restore("/runs/first", saved);
  await settle();
  expect(drawer("/runs/first")?.getAttribute("data-state")).toBe("open");
  expect(drawer("/runs/first")?.textContent).toContain(
    "Saved payload for /runs/first",
  );
});

it("mounts only the latest retained entity in a parallel slot and restores its predecessor", async () => {
  window.history.replaceState({}, "", "/runs/first");
  await render("/runs/first");
  const first = window.history.state;
  window.history.replaceState({}, "", "/runs/second");
  await render("/runs/second");
  await settle();
  expect(drawer("/runs/first")).toBeNull();
  expect(drawer("/runs/second")?.getAttribute("data-state")).toBe("open");
  await render();
  await restore("/runs/first", first);
  await settle();
  expect(drawer("/runs/first")?.getAttribute("data-state")).toBe("open");
  expect(drawer("/runs/second")).toBeNull();
});
