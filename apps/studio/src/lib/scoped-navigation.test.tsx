// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioRouteProvider } from "@/components/studio-route-provider";
import { useRouter } from "./scoped-navigation";

const { router, waitForQueryUpdates } = vi.hoisted(() => ({
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  },
  waitForQueryUpdates: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("nuqs", () => ({
  useQueryStates: () => [{}, waitForQueryUpdates],
}));

let root: Root;
let navigation: ReturnType<typeof useRouter>;
function Consumer() {
  navigation = useRouter();
  return null;
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  await act(() =>
    root.render(
      <StudioRouteProvider scope={{ projectPublicId: "prj_example" }}>
        <Consumer />
      </StudioRouteProvider>,
    ),
  );
});
afterEach(async () => {
  await act(() => root.unmount());
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

it.each([
  "push",
  "replace",
] as const)("%s waits for pending URL state before starting a scoped navigation", async (method) => {
  let release = () => {};
  waitForQueryUpdates.mockReturnValue(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  navigation[method]("/prompts?live=false", { scroll: false });
  expect(router[method]).not.toHaveBeenCalled();
  release();
  await act(async () => {});
  expect(waitForQueryUpdates).toHaveBeenCalledWith({});
  expect(router[method]).toHaveBeenCalledExactlyOnceWith(
    "/projects/prj_example/prompts?live=false",
    { scroll: false },
  );
});

it("still navigates when a queued URL write fails", async () => {
  waitForQueryUpdates.mockRejectedValue(new Error("History write failed"));
  navigation.push("/evals/runs");
  await act(async () => {});
  expect(router.push).toHaveBeenCalledExactlyOnceWith(
    "/projects/prj_example/evals/runs",
    undefined,
  );
});

it.each([
  "push",
  "replace",
] as const)("%s does not resume a cancelled tour navigation after a pending URL write", async (method) => {
  let release = () => {};
  waitForQueryUpdates.mockReturnValue(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  const controller = new AbortController();
  navigation[method]("/runs/sample-support-success", {
    scroll: false,
    signal: controller.signal,
  });
  controller.abort();
  release();
  await act(async () => {});
  expect(router[method]).not.toHaveBeenCalled();
});

it("forwards Next options without the cancellation signal", async () => {
  waitForQueryUpdates.mockResolvedValue(undefined);
  navigation.replace("/runs", {
    scroll: false,
    signal: new AbortController().signal,
  });
  await act(async () => {});
  expect(router.replace).toHaveBeenCalledExactlyOnceWith(
    "/projects/prj_example/runs",
    { scroll: false },
  );
});

it("updates client-owned queries without creating an intercepted copy of the page", async () => {
  window.history.replaceState(
    null,
    "",
    "/projects/prj_example/prompts/example?v=1",
  );
  waitForQueryUpdates.mockResolvedValue(undefined);
  navigation.replace("/prompts/example?v=2&compareWith=1", { shallow: true });
  await act(async () => {});
  expect(window.location.pathname + window.location.search).toBe(
    "/projects/prj_example/prompts/example?v=2&compareWith=1",
  );
  expect(router.replace).not.toHaveBeenCalled();
  navigation.replace("/runs", { shallow: true, scroll: false });
  await act(async () => {});
  expect(router.replace).toHaveBeenCalledExactlyOnceWith(
    "/projects/prj_example/runs",
    { scroll: false },
  );
});

it("refresh and prefetch do not wait on local URL state", () => {
  navigation.refresh();
  navigation.prefetch("/evals/suites");
  expect(waitForQueryUpdates).not.toHaveBeenCalled();
  expect(router.refresh).toHaveBeenCalledTimes(1);
  expect(router.prefetch).toHaveBeenCalledExactlyOnceWith(
    "/projects/prj_example/evals/suites",
    undefined,
  );
});
