// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { evalRequest } from "../api/client";
import type { EvaluationChanges } from "../lib/evaluation-changes";
import { useModalComparison } from "./use-modal-comparison";

vi.mock("../api/client", () => ({ evalRequest: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
const comparison = (id: string): EvaluationChanges => ({
  candidate: { id: "run", name: "Run", createdAt: "2026-01-02" },
  earlier: { id, name: id, createdAt: "2026-01-01" },
  signature: "saved",
  choices: [],
  rows: [],
  state: "ready",
});
it("aborts outdated baseline reads, fences late responses and reuses cached history", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  let value: ReturnType<typeof useModalComparison>;
  function View({ baseline }: { baseline: string }) {
    value = useModalComparison("run", baseline);
    return null;
  }
  let finishA: ((value: unknown) => void) | undefined;
  let signalA: AbortSignal | undefined;
  vi.mocked(evalRequest).mockImplementation((path, _, signal) => {
    if (path.includes("baseline=a")) {
      signalA = signal;
      return new Promise((resolve) => {
        finishA = resolve;
      });
    }
    return Promise.resolve(comparison("b"));
  });
  await act(async () => root.render(<View baseline="a" />));
  await act(async () => root.render(<View baseline="b" />));
  expect(signalA?.aborted).toBe(true);
  expect(value!.comparison?.earlier?.id).toBe("b");
  await act(async () => finishA?.(comparison("a")));
  expect(value!.comparison?.earlier?.id).toBe("b");
  await act(async () => root.render(<View baseline="b" />));
  expect(evalRequest).toHaveBeenCalledTimes(2);
  await act(async () => root.unmount());
});
it("only reads selected data, exposes recoverable errors, and does not refetch cached history after a retry", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  let value: ReturnType<typeof useModalComparison>;
  const seed = {
    ...comparison("a"),
    choices: [{ id: "a", name: "a", createdAt: "2026-01-01" }],
  };
  function View({ run, baseline }: { run?: string; baseline: string }) {
    value = useModalComparison(run, baseline, seed);
    return null;
  }
  await act(async () => root.render(<View baseline="a" />));
  expect(evalRequest).not.toHaveBeenCalled();
  await act(async () => root.render(<View run="run" baseline="a" />));
  expect(evalRequest).not.toHaveBeenCalled();
  vi.mocked(evalRequest)
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue(comparison("b"));
  await act(async () => root.render(<View run="run" baseline="b" />));
  expect(value!.error).toContain("Retry");
  await act(async () => value!.retry());
  expect(value!.comparison?.earlier?.id).toBe("b");
  expect(value!.error).toBeUndefined();
  const reads = vi.mocked(evalRequest).mock.calls.length;
  await act(async () => root.render(<View run="run" baseline="a" />));
  await act(async () => root.render(<View run="run" baseline="b" />));
  expect(value!.comparison?.earlier?.id).toBe("b");
  expect(vi.mocked(evalRequest).mock.calls.length).toBe(reads);
  await act(async () => root.unmount());
});
