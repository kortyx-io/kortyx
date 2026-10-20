import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readSampleDataset } from "@/features/sample-project/data";
import { earlierEvaluations, summarizeChanges } from "./evaluation-changes";

const evaluations = () =>
  readSampleDataset().evals.evaluations.map(({ results }) =>
    structuredClone(results.run),
  );
it("chooses a previous completed run independently of table order and excludes other scopes", () => {
  const history = evaluations();
  const current = history.find((run) => run.id === sample.evaluationId)!;
  const baseline = history.find(
    (run) => run.id === sample.evaluationIds.baseline,
  )!;
  const choices = earlierEvaluations(current, [
    ...history.reverse(),
    { ...baseline, id: "other-app", targetId: "other" },
    { ...baseline, id: "other-env", environment: "other" },
    { ...baseline, id: "legacy", legacy: true },
  ]);
  expect(choices.map((run) => run.id)).toEqual([baseline.id]);
});
it("summarizes cases with compact identities and never includes conversation evidence", () => {
  const history = evaluations(),
    current = history.find((run) => run.id === sample.evaluationId)!,
    earlier = history.find((run) => run.id === sample.evaluationIds.baseline)!;
  const rows = summarizeChanges(earlier, current);
  const improved = rows.find(
    (row) => row.caseId === sample.caseId && row.suiteId === sample.suiteId,
  )!;
  expect(improved).toMatchObject({
    kind: "improved",
    label: "Now passing",
    earlier: { passed: 0, total: 1 },
    current: { passed: 1, total: 1 },
  });
  expect(JSON.stringify(rows)).not.toMatch(
    /observation|sessionId|cannot tell you|criteria|promptSnapshot/,
  );
  expect(rows.some((row) => row.label === "No earlier result")).toBe(true);
});
it("keeps known failures separate from unchanged successes and errors", () => {
  const earlier = evaluations().find(
    (run) => run.id === sample.evaluationIds.baseline,
  )!;
  const rows = summarizeChanges(earlier, structuredClone(earlier));
  expect(rows.find((row) => row.caseId === sample.caseId)?.kind).toBe(
    "still-failing",
  );
  expect(rows.some((row) => row.kind === "review")).toBe(true);
  expect(rows.some((row) => row.kind === "unchanged")).toBe(true);
});
it("compares pass rates across repetition counts and withholds changed-grader deltas", () => {
  const earlier = evaluations().find((run) => run.id === sample.evaluationId)!,
    current = structuredClone(earlier);
  const suite = current.suites.find((run) => run.suiteId === sample.suiteId)!;
  const first = suite.result!.cases.find(
    (entry) => entry.caseId === sample.caseId,
  )!;
  suite.result!.cases.push({ ...structuredClone(first), repetition: 2 });
  expect(
    summarizeChanges(earlier, current).find(
      (row) => row.caseId === sample.caseId,
    ),
  ).toMatchObject({ kind: "unchanged", current: { passed: 2, total: 2 } });
  if (!suite.result?.judge) throw new Error("Missing sample grader");
  suite.result.judge.version = "changed";
  expect(
    summarizeChanges(earlier, current)
      .filter((row) => row.suiteId === sample.suiteId)
      .every((row) => row.kind === "review"),
  ).toBe(true);
});

it("sums whole-conversation duration and costs while keeping incomplete evidence unknown", () => {
  const earlier = evaluations().find((run) => run.id === sample.evaluationId)!;
  const current = structuredClone(earlier);
  const suite = current.suites.find((run) => run.suiteId === sample.suiteId)!;
  const first = suite.result!.cases.find(
    (entry) => entry.caseId === sample.caseId,
  )!;
  first.durationMs = 1000;
  const second = { ...structuredClone(first), repetition: 2, durationMs: 3000 };
  suite.result!.cases.push(second);
  const firstCost = suite.caseCosts?.[`${sample.caseId}:1`];
  if (!suite.caseCosts || !firstCost || !suite.request)
    throw new Error("Missing priced sample evidence");
  suite.caseCosts[`${sample.caseId}:2`] = structuredClone(firstCost);
  suite.request.repetitions = 2;
  const get = () =>
    summarizeChanges(earlier, current).find(
      (row) => row.suiteId === sample.suiteId && row.caseId === sample.caseId,
    )!;
  expect(get().current.durationMs).toBe(4000);
  expect(get().current.total).toBe(2);
  expect(get().current.costs?.total.amount).toBeCloseTo(
    (firstCost.total.amount ?? 0) * 2,
  );
  suite.result!.cases = suite.result!.cases.filter((entry) => entry !== second);
  delete suite.caseCosts[`${sample.caseId}:2`];
  expect(get().current.durationMs).toBeUndefined();
  expect(get().current.costs?.total.status).toBe("partial");
  expect(get().current.costs?.total.costSummary?.complete).toBe(false);
});
