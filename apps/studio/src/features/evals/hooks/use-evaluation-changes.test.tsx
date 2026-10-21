// @vitest-environment jsdom
import type { StudioEvaluationSummary } from "@kortyx/agent/evals";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../api/client", () => ({ evalRequest: vi.fn() }));
vi.mock("server-only", () => ({}));

import { createSampleProjectReadModels } from "@kortyx/telemetry-db/sample-project";
import { createSampleEvaluations } from "@/features/sample-project/evaluations";
import { createSamplePrompts } from "@/features/sample-project/prompts";

const readSampleDataset = () => ({
  evals: createSampleEvaluations(
    createSampleProjectReadModels(),
    createSamplePrompts(),
  ),
});

import { evalRequest } from "../api/client";
import { useEvaluationChanges } from "./use-evaluation-changes";

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
it("reads in the background only on terminal versions, reuses unchanged rows and retries failures explicitly", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const rows = readSampleDataset()
    .evals.evaluations.map((e) => e.detail.run)
    .filter((r) => r.status !== "running" && r.status !== "queued")
    .slice(0, 2);
  const active = { ...rows[0], id: "active", status: "running" as const };
  vi.mocked(evalRequest).mockResolvedValue({ changes: {} });
  const root = createRoot(document.createElement("div"));
  function View({
    runs,
    refresh = 0,
  }: {
    runs: StudioEvaluationSummary[];
    refresh?: number;
  }) {
    useEvaluationChanges(runs, refresh);
    return <div>Ready</div>;
  }
  await act(async () => root.render(<View runs={[...rows, active]} />));
  expect(evalRequest).toHaveBeenCalledOnce();
  expect(String(vi.mocked(evalRequest).mock.calls[0]?.[0])).not.toContain(
    "active",
  );
  for (let i = 1; i <= 5; i++)
    await act(async () =>
      root.render(
        <View runs={[...rows, { ...active, completedAttempts: i }]} />,
      ),
    );
  expect(evalRequest).toHaveBeenCalledOnce();
  const completed = { ...active, status: "passed" as const };
  await act(async () => root.render(<View runs={[...rows, completed]} />));
  expect(evalRequest).toHaveBeenCalledTimes(2);
  expect(String(vi.mocked(evalRequest).mock.calls[1]?.[0])).toContain(
    "ids=active",
  );
  vi.mocked(evalRequest).mockRejectedValue(new Error("Offline"));
  await act(async () =>
    root.render(<View runs={[...rows, completed]} refresh={1} />),
  );
  const attempts = vi.mocked(evalRequest).mock.calls.length;
  await act(async () =>
    root.render(<View runs={[...rows, completed]} refresh={1} />),
  );
  expect(evalRequest).toHaveBeenCalledTimes(attempts);
  await act(async () =>
    root.render(<View runs={[...rows, completed]} refresh={2} />),
  );
  expect(evalRequest).toHaveBeenCalledTimes(attempts + 1);
  await act(async () => root.unmount());
});
it("cancels replaced pages and fences late responses", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const rows = readSampleDataset()
    .evals.evaluations.map((e) => e.detail.run)
    .filter((r) => r.status !== "running" && r.status !== "queued")
    .slice(0, 2);
  let resolveOld: (value: unknown) => void = () => {};
  vi.mocked(evalRequest)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValue({ changes: {} });
  const root = createRoot(document.createElement("div"));
  let state: ReturnType<typeof useEvaluationChanges>;
  function View({ runs }: { runs: StudioEvaluationSummary[] }) {
    state = useEvaluationChanges(runs, 0);
    return null;
  }
  await act(async () => root.render(<View runs={[rows[0]]} />));
  const signal = vi.mocked(evalRequest).mock.calls[0]?.[2];
  await act(async () => root.render(<View runs={[rows[1]]} />));
  expect(signal?.aborted).toBe(true);
  await act(async () => resolveOld({ changes: {} }));
  expect(state!.changes).toEqual({});
  expect(state!.loadingIds.size).toBe(0);
  await act(async () => root.unmount());
});
