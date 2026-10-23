// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioQueryContext } from "@/lib/studio-query-context";
import { studioPathname } from "@/lib/studio-routing";
import { DetailDrawer, DetailDrawerHost } from "./detail-drawer";
import { DETAIL_MOTION_DURATION_MS } from "./detail-motion";
import { DetailSlotPresence } from "./detail-slot-presence";
import {
  DetailStackProvider,
  usePrepareDetailNavigation,
} from "./detail-stack";

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ isMobile: false, state: "expanded" }),
}));
const navigation = vi.hoisted(() => ({ pathname: null as string | null }));
vi.mock("@/lib/scoped-navigation", () => ({
  usePathname: () =>
    navigation.pathname ?? studioPathname(window.location.pathname),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/nuqs", async (original) => ({
  ...(await original<typeof import("@/lib/nuqs")>()),
  useStudioQueryStates: () => [{ detailView: "drawer" }, vi.fn()],
}));

let container: HTMLDivElement;
let root: Root;
let prepareNavigation: ReturnType<typeof usePrepareDetailNavigation>;
function NavigationControl() {
  prepareNavigation = usePrepareDetailNavigation();
  return null;
}
beforeEach(() => {
  navigation.pathname = null;
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

async function render(path?: string, secondary?: string) {
  await act(() =>
    root.render(
      <DetailStackProvider>
        <NavigationControl />
        <DetailDrawerHost>
          {[path, secondary]
            .filter((path) => path !== undefined)
            .map((path) => (
              <DetailDrawer
                key={path}
                matchPath={path}
                dismissPath={
                  path.startsWith("/sessions/") ? "/sessions" : "/runs"
                }
                title={path}
                description="Recorded run"
              >
                <p>Saved payload for {path}</p>
              </DetailDrawer>
            ))}
        </DetailDrawerHost>
      </DetailStackProvider>,
    ),
  );
}
async function settle() {
  // Registration cleanup commits first; its exit effect schedules the next
  // timer after React flushes that commit. Advance each phase in its own act.
  for (let phase = 0; phase < 3; phase++)
    await act(() => vi.advanceTimersByTimeAsync(DETAIL_MOTION_DURATION_MS));
}
async function restore(path: string, state: unknown) {
  await act(() => {
    window.history.replaceState(state, "", path);
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });
}
const drawer = (path: string) =>
  container.querySelector(`[data-detail-drawer="${path}"]`);

it("opens the committed drawer while Next still retains the list pathname", async () => {
  const path = "/runs/first";
  window.history.replaceState({}, "", path);
  navigation.pathname = "/runs";
  await act(() =>
    root.render(
      <StudioQueryContext.Provider
        value={{
          pathname: path,
          searchParams: new URLSearchParams(),
          updateUrl: vi.fn(),
        }}
      >
        <DetailStackProvider>
          <DetailDrawerHost>
            <DetailDrawer
              matchPath={path}
              dismissPath="/runs"
              title="Run"
              description="Recorded run"
            >
              <p>Committed run payload</p>
            </DetailDrawer>
          </DetailDrawerHost>
        </DetailStackProvider>
      </StudioQueryContext.Provider>,
    ),
  );
  expect(drawer(path)?.getAttribute("data-state")).toBe("open");
  expect(drawer(path)?.textContent).toContain("Committed run payload");
});

it("retains different parallel slots sharing the same dismiss destination", async () => {
  const casePath = "/evals/cases/run/case/1";
  const judgePath = "/evals/judges/run/run";
  const renderJudgeStack = async (showJudge: boolean) => {
    await act(() =>
      root.render(
        <DetailStackProvider>
          <NavigationControl />
          <DetailDrawerHost>
            <DetailSlotPresence dismissPath="/evals/cases">
              <DetailDrawer
                matchPath={casePath}
                dismissPath="/evals/cases"
                title="Case"
                description="Case evidence"
              >
                <p>Original case payload</p>
              </DetailDrawer>
            </DetailSlotPresence>
            <DetailSlotPresence dismissPath="/evals/judges">
              {showJudge ? (
                <DetailDrawer
                  matchPath={judgePath}
                  dismissPath="/evals/cases"
                  title="Judge"
                  description="Saved instructions"
                >
                  <p>Saved judge payload</p>
                </DetailDrawer>
              ) : null}
            </DetailSlotPresence>
          </DetailDrawerHost>
        </DetailStackProvider>,
      ),
    );
  };
  window.history.replaceState({}, "", casePath);
  await renderJudgeStack(false);
  const original = drawer(casePath);
  await act(() => prepareNavigation?.(judgePath));
  window.history.replaceState({}, "", judgePath);
  await renderJudgeStack(true);
  await settle();
  expect(drawer(judgePath)?.getAttribute("data-state")).toBe("open");
  expect(drawer(casePath)).toBe(original);
  expect(original?.getAttribute("data-state")).toBe("open");
  expect(original?.textContent).toContain("Original case payload");
});

it("unmounts a closed history layer even while Next retains its route registration", async () => {
  window.history.replaceState({}, "", "/runs/first");
  await render("/runs/first");
  const runHistory = window.history.state;
  await act(() => prepareNavigation?.("/sessions/parent"));
  window.history.replaceState({}, "", "/sessions/parent");
  await render("/runs/first", "/sessions/parent");
  const sessionHistory = window.history.state;
  await restore("/runs/first", runHistory);
  // Both route payloads remain registered; history still owns presentation.
  await render("/runs/first", "/sessions/parent");
  await settle();
  expect(drawer("/runs/first")?.getAttribute("data-state")).toBe("open");
  expect(drawer("/sessions/parent")).toBeNull();
  await restore("/sessions/parent", sessionHistory);
  await settle();
  expect(drawer("/sessions/parent")?.getAttribute("data-state")).toBe("open");
  await restore("/runs/first", runHistory);
  await settle();
  expect(drawer("/sessions/parent")).toBeNull();
});

it("retains the mounted ancestor when Next releases its parallel slot", async () => {
  window.history.replaceState({}, "", "/runs/first");
  await render("/runs/first");
  const original = drawer("/runs/first");
  expect(original).not.toBeNull();
  await act(() => prepareNavigation?.("/sessions/parent"));
  window.history.replaceState({}, "", "/sessions/parent");
  await render();
  await settle();
  expect(drawer("/runs/first")).toBe(original);
  expect(original?.getAttribute("data-state")).toBe("open");
});

it.each([
  "/runs",
  "/evals/suites/target/suite",
  "/prompts/categories/folder",
])("closes retained payloads when a normal navigation opens %s", async (path) => {
  window.history.replaceState({}, "", "/runs/first");
  await render("/runs/first");
  window.history.replaceState({}, "", path);
  await render();
  await settle();
  expect(drawer("/runs/first")).toBeNull();
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
  await restore("/runs", {});
  expect(drawer("/runs/first")?.getAttribute("data-state")).toBe("closed");
  await act(() => vi.advanceTimersByTimeAsync(DETAIL_MOTION_DURATION_MS - 1));
  expect(drawer("/runs/first")).not.toBeNull();
  await settle();
  expect(drawer("/runs/first")).toBeNull();
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
