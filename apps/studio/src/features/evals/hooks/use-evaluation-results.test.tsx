// @vitest-environment jsdom

import { createSampleProjectReadModels } from "@kortyx/telemetry-db/sample-project";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createSampleEvaluations } from "@/features/sample-project/evaluations";
import { createSamplePrompts } from "@/features/sample-project/prompts";
import { evalRequest } from "../api/client";
import { useEvaluationResults } from "./use-evaluation-results";

vi.mock("../api/client", () => ({ evalRequest: vi.fn() }));

it("aborts stale baseline reads, ignores late responses, and recovers from a failed replacement", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const [first, second] = createSampleEvaluations(
    createSampleProjectReadModels(),
    createSamplePrompts(),
  ).evaluations;
  let resolveFirst: (value: unknown) => void = () => {};
  vi.mocked(evalRequest).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
  );
  const container = document.createElement("div"),
    root = createRoot(container);
  let current: ReturnType<typeof useEvaluationResults> | undefined;
  function Probe({ id }: { id: string }) {
    current = useEvaluationResults(id, null);
    return <span>{current.value?.id ?? current.error ?? "Loading"}</span>;
  }
  try {
    await act(() => root.render(<Probe id={first.results.run.id} />));
    const signal = vi.mocked(evalRequest).mock.calls[0]?.[2];
    vi.mocked(evalRequest).mockRejectedValueOnce(new Error("offline"));
    await act(() => root.render(<Probe id={second.results.run.id} />));
    expect(signal?.aborted).toBe(true);
    expect(container.textContent).toContain(
      "Could not load saved evaluation results",
    );
    await act(async () => resolveFirst(first.results));
    expect(current?.value).toBeNull();
    expect(container.textContent).not.toContain(first.results.run.id);
    vi.mocked(evalRequest).mockResolvedValueOnce(second.results);
    await act(async () => current?.retry());
    expect(container.textContent).toBe(second.results.run.id);
    expect(current?.loading).toBe(false);
    expect(current?.error).toBeNull();
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
