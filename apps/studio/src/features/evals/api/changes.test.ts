import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./server", () => ({ readEvaluationComparison: vi.fn() }));

import { sampleEvaluationComparison } from "@/features/sample-project/comparison";
import { readSampleDataset } from "@/features/sample-project/data";
import { readEvaluationChanges } from "./changes";
import { readEvaluationComparison } from "./server";

const data = () =>
  readSampleDataset().evals.evaluations.map(({ results }) =>
    structuredClone(results.run),
  );
beforeEach(() => {
  vi.mocked(readEvaluationComparison).mockReset();
});
it("deduplicates reads, excludes active/legacy runs and returns only compact change cells", async () => {
  const history = data();
  vi.mocked(readEvaluationComparison).mockImplementation(async (id) => ({
    run: sampleEvaluationComparison(history.find((run) => run.id === id)!),
  }));
  const result = await readEvaluationChanges(history, history);
  const ids = vi.mocked(readEvaluationComparison).mock.calls.map(([id]) => id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).not.toContain(sample.evaluationIds.candidate);
  expect(result[sample.evaluationId].state).toBe("ready");
  expect(result[sample.evaluationIds.candidate].state).toBe("active");
  expect(JSON.stringify(result)).not.toContain("observation");
});
it("marks read failures and invalid references unavailable rather than returning zero changes", async () => {
  const history = data(),
    run = history.find((run) => run.id === sample.evaluationId)!;
  vi.mocked(readEvaluationComparison).mockImplementation(async () => {
    throw new Error("Unavailable");
  });
  const result = await readEvaluationChanges([run], history);
  expect(result[run.id]).toMatchObject({ state: "error", rows: [] });
  vi.mocked(readEvaluationComparison).mockClear();
  const invalid = await readEvaluationChanges([run], history, "different-app");
  expect(invalid[run.id].state).toBe("error");
  expect(vi.mocked(readEvaluationComparison).mock.calls).toHaveLength(0);
});
it("reads one compact snapshot at a time", async () => {
  const base = data().find((run) => run.id === sample.evaluationId)!;
  const history = Array.from({ length: 10 }, (_, index) => ({
    ...structuredClone(base),
    id: `run-${index}`,
    createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  }));
  let active = 0,
    peak = 0;
  vi.mocked(readEvaluationComparison).mockImplementation(async (id) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return {
      run: sampleEvaluationComparison(history.find((run) => run.id === id)!),
    };
  });
  await readEvaluationChanges(history, history);
  expect(peak).toBe(1);
});

it("rejects excess requests instead of retaining an unbounded queue and releases capacity", async () => {
  const history = data();
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.mocked(readEvaluationComparison).mockImplementation(async (id) => {
    await pending;
    return {
      run: sampleEvaluationComparison(history.find((run) => run.id === id)!),
    };
  });
  const a = readEvaluationChanges(history, history),
    b = readEvaluationChanges(history, history);
  const calls = vi.mocked(readEvaluationComparison).mock.calls.length;
  try {
    const overflow = await readEvaluationChanges(history, history);
    expect(overflow[sample.evaluationId].state).toBe("error");
    expect(vi.mocked(readEvaluationComparison).mock.calls.length).toBe(calls);
  } finally {
    release();
    await Promise.all([a, b]);
  }
  const next = await readEvaluationChanges(history, history);
  expect(next[sample.evaluationId].state).toBe("ready");
});
