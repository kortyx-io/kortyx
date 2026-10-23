// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { studioPathname } from "@/lib/studio-routing";
import { DETAIL_MOTION_DURATION_MS } from "./detail-motion";
import { DetailStackProvider, useDetailStackLayer } from "./detail-stack";

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ isMobile: false }),
}));
const router = { push: vi.fn() };
const params = new URLSearchParams();
const navigation = vi.hoisted(() => ({ pathname: null as string | null }));
vi.mock("@/lib/scoped-navigation", () => ({
  usePathname: () =>
    navigation.pathname ?? studioPathname(window.location.pathname),
  useRouter: () => router,
  useSearchParams: () => params,
}));

const scope = "/projects/prj_0123456789abcdef01234567";
const parent = "/prompts/parent";
const child = "/prompts/child";
const controls = new Map<string, ReturnType<typeof useDetailStackLayer>>();
function Layer({ path }: { path: string }) {
  controls.set(
    path,
    useDetailStackLayer({ id: path, matchPath: path, dismissPath: "/prompts" }),
  );
  return null;
}
let root: Root;
beforeEach(() => {
  navigation.pathname = null;
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  controls.clear();
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function render(paths: string[]) {
  await act(() =>
    root.render(
      <DetailStackProvider>
        {paths.map((path) => (
          <Layer key={path} path={path} />
        ))}
      </DetailStackProvider>,
    ),
  );
}
function backTo(path: string) {
  return vi.spyOn(window.history, "back").mockImplementation(() => {
    window.history.replaceState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}
async function finishMotion() {
  await act(() => vi.advanceTimersByTimeAsync(DETAIL_MOTION_DURATION_MS + 1));
}

describe.each(["", scope])("drawer history under %s", (prefix) => {
  it("closes the browser's active drawer while the framework still reports its retained ancestor", async () => {
    window.history.replaceState({}, "", `${prefix}${child}`);
    navigation.pathname = parent;
    await render([parent, child]);
    const back = backTo(`${prefix}${parent}`);
    await act(() => controls.get(child)!.closeTop());
    expect(controls.get(child)!.closing).toBe(true);
    await finishMotion();
    expect(back).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe(`${prefix}${parent}`);
  });

  it("defers an early close until the browser reaches the newly shown drawer", async () => {
    window.history.replaceState({}, "", `${prefix}${parent}`);
    navigation.pathname = parent;
    await render([parent, child]);
    const back = backTo(`${prefix}${parent}`);
    await act(() => controls.get(child)!.closeTop());
    await finishMotion();
    expect(back).not.toHaveBeenCalled();
    expect(controls.get(child)!.closing).toBe(false);
    window.history.replaceState({}, "", `${prefix}${child}`);
    navigation.pathname = child;
    await render([parent, child]);
    await finishMotion();
    expect(back).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe(`${prefix}${parent}`);
  });

  it("closes to the list and reopens the same detail", async () => {
    window.history.replaceState({}, "", `${prefix}${child}`);
    await render([child]);
    expect(window.history.state.__kortyxDetailStack.pathname).toBe(
      `${prefix}${child}`,
    );
    expect(window.history.state.__kortyxDetailStack.layers).toHaveLength(1);
    const back = backTo(`${prefix}/prompts`);
    await act(() => controls.get(child)!.closeTop());
    await finishMotion();
    expect(back).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe(`${prefix}/prompts`);
    await render([]);
    await finishMotion();
    window.history.replaceState({}, "", `${prefix}${child}`);
    await render([child]);
    expect(controls.get(child)!.closing).toBe(false);
    expect(controls.get(child)!.isTop).toBe(true);
  });

  it("peels descendants and closes the remaining stack", async () => {
    window.history.replaceState({}, "", `${prefix}${child}`);
    await render([parent, child]);
    const back = backTo(`${prefix}${parent}`);
    await act(() => controls.get(parent)!.closeAbove());
    await finishMotion();
    expect(back).toHaveBeenCalledTimes(1);
    expect(controls.get(parent)!.closing).toBe(false);
    expect(controls.get(child)!.closing).toBe(true);
    back.mockRestore();
    const backToList = backTo(`${prefix}/prompts`);
    await act(() => controls.get(parent)!.closeAll());
    await finishMotion();
    expect(backToList).toHaveBeenCalledTimes(1);
    expect(controls.get(parent)!.closing).toBe(true);
  });

  it("restores a detail through browser Forward without a saved snapshot", async () => {
    window.history.replaceState({}, "", `${prefix}${child}`);
    await render([child]);
    await act(() => controls.get(child)!.beginClose());
    await act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(controls.get(child)!.closing).toBe(false);
  });
});
