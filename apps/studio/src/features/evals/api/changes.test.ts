import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./server", () => ({ readEvaluationResults: vi.fn() }));

import { readSampleDataset } from "@/features/sample-project/data";
import { readEvaluationChanges } from "./changes";
import { readEvaluationResults } from "./server";

const data = () =>
  readSampleDataset().evals.evaluations.map(({ results }) =>
    structuredClone(results.run),
  );
beforeEach(() => {
  vi.mocked(readEvaluationResults).mockReset();
});
it("deduplicates reads, excludes active/legacy runs and returns only compact change cells", async () => {
  const history = data();
  vi.mocked(readEvaluationResults).mockImplementation(async (id) => ({
    run: history.find((run) => run.id === id)!,
  }));
  const result = await readEvaluationChanges(history, history);
  const ids = vi.mocked(readEvaluationResults).mock.calls.map(([id]) => id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).not.toContain(sample.evaluationIds.candidate);
  expect(result[sample.evaluationId].state).toBe("ready");
  expect(result[sample.evaluationIds.candidate].state).toBe("active");
  expect(JSON.stringify(result)).not.toContain("observation");
});
it("marks read failures and invalid references unavailable rather than returning zero changes", async () => {
  const history = data(),
    run = history.find((run) => run.id === sample.evaluationId)!;
  vi.mocked(readEvaluationResults).mockImplementation(async () => {
    throw new Error("Unavailable");
  });
  const result = await readEvaluationChanges([run], history);
  expect(result[run.id]).toMatchObject({ state: "error", rows: [] });
  vi.mocked(readEvaluationResults).mockClear();
  const invalid = await readEvaluationChanges([run], history, "different-app");
  expect(invalid[run.id].state).toBe("error");
  expect(vi.mocked(readEvaluationResults).mock.calls).toHaveLength(0);
});
it("limits concurrent saved-result reads to four", async () => {
  const base = data().find((run) => run.id === sample.evaluationId)!;
  const history = Array.from({ length: 10 }, (_, index) => ({
    ...structuredClone(base),
    id: `run-${index}`,
    createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  }));
  let active = 0,
    peak = 0;
  vi.mocked(readEvaluationResults).mockImplementation(async (id) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return { run: history.find((run) => run.id === id)! };
  });
  await readEvaluationChanges(history, history);
  expect(peak).toBe(4);
});
