// @vitest-environment jsdom

import { StudioEvalLiveDetailSchema } from "@kortyx/agent/evals";
import { createSampleProjectReadModels } from "@kortyx/telemetry-db/sample-project";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { createSampleEvaluations } from "@/features/sample-project/evaluations";
import { createSamplePrompts } from "@/features/sample-project/prompts";
import { useLiveRefresh } from "@/features/telemetry/hooks/use-live-refresh";
import { evalRequest } from "../api/client";
import { useEvaluationLiveRuns } from "./use-evaluation-live-runs";

vi.mock("../api/client", () => ({ evalRequest: vi.fn() }));
vi.mock("@/lib/nuqs", () => ({ useStudioQueryState: () => [true] }));
vi.mock("@/features/telemetry/hooks/use-live-refresh", () => ({
  useLiveRefresh: vi.fn(),
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function fixture(index = 0) {
  const { run } = createSampleEvaluations(
    createSampleProjectReadModels(),
    createSamplePrompts(),
  ).runs[0];
  return StudioEvalLiveDetailSchema.parse({
    run: {
      ...run,
      id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      version: "a".repeat(64),
      cases: [],
      errors: [],
    },
  }).run;
}

it("bounds compact reads, reuses snapshots across filter renders, and refreshes by version", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const runs = Array.from({ length: 6 }, (_, i) => fixture(i));
  let active = 0,
    peak = 0;
  vi.mocked(evalRequest).mockImplementation(async (path) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 0));
    active--;
    return { run: runs.find((run) => path.includes(run.id)) };
  });
  const root = createRoot(document.createElement("div"));
  let current: ReturnType<typeof useEvaluationLiveRuns> | undefined;
  function Probe({ filter = "all" }: { filter?: string }) {
    current = useEvaluationLiveRuns(
      "evaluation",
      runs.map((run) => run.id),
    );
    return <span>{filter}</span>;
  }
  try {
    await act(async () => {
      root.render(<Probe />);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(current?.runs).toHaveLength(6);
    expect(peak).toBeLessThanOrEqual(4);
    expect(
      vi
        .mocked(evalRequest)
        .mock.calls.every(([path]) => path.endsWith("/live")),
    ).toBe(true);
    await act(() => root.render(<Probe filter="suite" />));
    expect(evalRequest).toHaveBeenCalledTimes(6);
    vi.mocked(evalRequest).mockImplementation(async () => ({
      version: "a".repeat(64),
      run: null,
    }));
    await act(async () => {
      await current?.refresh();
    });
    expect(current?.runs).toHaveLength(6);
    expect(
      vi
        .mocked(evalRequest)
        .mock.calls.slice(6)
        .every(([path]) => path.includes("/live?after=")),
    ).toBe(true);
    expect(useLiveRefresh).toHaveBeenLastCalledWith(
      expect.objectContaining({
        resource: "evals",
        refreshKey: expect.not.stringContaining("suite"),
      }),
    );
  } finally {
    await act(() => root.unmount());
  }
});

it("keeps successful suites when another fails and ignores an aborted previous evaluation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const first = fixture(1),
    second = fixture(2);
  let resolveOld: (value: unknown) => void = () => {};
  vi.mocked(evalRequest).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  const root = createRoot(document.createElement("div"));
  let current: ReturnType<typeof useEvaluationLiveRuns> | undefined;
  function Probe({ id, ids }: { id: string; ids: string[] }) {
    current = useEvaluationLiveRuns(id, ids);
    return null;
  }
  try {
    await act(() => root.render(<Probe id="old" ids={[first.id]} />));
    const signal = vi.mocked(evalRequest).mock.calls[0][2];
    vi.mocked(evalRequest).mockImplementation(async (path) => {
      if (path.includes(first.id)) throw new Error("offline");
      return { run: second };
    });
    await act(() =>
      root.render(<Probe id="new" ids={[first.id, second.id]} />),
    );
    expect(signal?.aborted).toBe(true);
    expect(current?.failed).toEqual([first.id]);
    expect(current?.runs.map((run) => run.id)).toEqual([second.id]);
    await act(async () => resolveOld({ run: first }));
    expect(current?.runs.map((run) => run.id)).toEqual([second.id]);
    vi.mocked(evalRequest).mockImplementation(async (path) =>
      path.includes(first.id)
        ? { run: first }
        : { version: second.version, run: null },
    );
    await act(async () => {
      await current?.refresh();
    });
    expect(current?.failed).toEqual([]);
    expect(current?.runs).toHaveLength(2);
  } finally {
    await act(() => root.unmount());
  }
});
