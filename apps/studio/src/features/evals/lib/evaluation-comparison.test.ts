import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readSampleDataset } from "@/features/sample-project/data";
import { compareEvaluations } from "./evaluation-comparison";

function evaluations() {
  const data = readSampleDataset().evals.evaluations;
  const baseline = data.find(
    ({ results }) => results.run.id === sample.evaluationIds.baseline,
  )?.results.run;
  const candidate = data.find(
    ({ results }) => results.run.id === sample.evaluationId,
  )?.results.run;
  if (!baseline || !candidate) throw new Error("Missing sample evaluations");
  return { baseline, candidate };
}
describe("evaluation comparisons", () => {
  it("matches suites and cases by identity despite different ordering, retaining missing suites", () => {
    const { baseline, candidate } = evaluations();
    const expected = compareEvaluations(baseline, candidate);
    candidate.suites.reverse();
    baseline.suites.reverse();
    for (const suite of candidate.suites) suite.suite.cases.reverse();
    const actual = compareEvaluations(baseline, candidate);
    expect(actual.map((r) => [r.key, r.change]).sort()).toEqual(
      expected.map((r) => [r.key, r.change]).sort(),
    );
    expect(new Set(actual.map((row) => row.key)).size).toBe(actual.length);
    const missing = actual.filter((row) => !row.baselineRunId);
    expect(missing.length).toBeGreaterThan(0);
    expect(
      missing.every(
        (row) => row.change === "incomplete" && row.baseline.length === 0,
      ),
    ).toBe(true);
    expect(actual.some((row) => row.change === "improved")).toBe(true);
  });
  it("does not compute improvements for changed graders or incomplete grading", () => {
    const { baseline, candidate } = evaluations();
    const shared = candidate.suites.find((s) =>
      baseline.suites.some((b) => b.suiteId === s.suiteId),
    );
    if (!shared?.result?.judge) throw new Error("Missing graded suite");
    shared.result.judge.version = "different";
    expect(
      compareEvaluations(baseline, candidate)
        .filter((row) => row.suiteId === shared.suiteId)
        .every((row) => ["changed", "incomplete"].includes(row.change)),
    ).toBe(true);
    shared.result = null;
    shared.events = [];
    shared.status = "running";
    expect(
      compareEvaluations(baseline, candidate)
        .filter((row) => row.suiteId === shared.suiteId)
        .every((row) => row.change === "incomplete"),
    ).toBe(true);
  });
  it("keeps the saved data unchanged during repeated comparison", () => {
    const values = evaluations(),
      before = structuredClone(values);
    compareEvaluations(values.baseline, values.candidate);
    compareEvaluations(values.baseline, values.candidate);
    expect(values).toEqual(before);
  });
});
