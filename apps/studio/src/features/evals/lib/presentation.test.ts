import { describe, expect, it } from "vitest";
import type { EvalDetail } from "../schema";
import { caseRows, compareRuns, progressCounts } from "./presentation";

const run = (): EvalDetail => ({
  id: "a",
  targetId: "app",
  targetName: "App",
  environment: "dev",
  suiteId: "jobs",
  suiteRevision: "same",
  status: "running",
  createdAt: "2026-10-01T00:00:00Z",
  startedAt: null,
  endedAt: null,
  error: null,
  cancelRequestedAt: null,
  request: { repetitions: 2, caseIds: ["ambiguity"] },
  suite: {
    id: "jobs",
    cases: [
      {
        id: "ambiguity",
        steps: [{ message: "Find role", expect: { type: "interrupt" } }],
      },
      { id: "salary", steps: [] },
    ],
  },
  result: null,
  events: [],
});
function finished(
  status: "passed" | "failed",
  reference: unknown = { id: "job" },
): EvalDetail {
  const data = run();
  data.status = status;
  data.request = { repetitions: 1, caseIds: ["ambiguity"] };
  data.result = {
    id: data.id,
    suiteId: data.suiteId,
    suiteRevision: data.suiteRevision,
    suite: data.suite,
    judge: { id: "judge", version: "1" },
    startedAt: data.createdAt,
    durationMs: 10,
    status,
    counts: {
      passed: status === "passed" ? 1 : 0,
      failed: status === "failed" ? 1 : 0,
      error: 0,
      cancelled: 0,
    },
    errors: [],
    cases: [
      {
        caseId: "ambiguity",
        repetition: 1,
        sessionId: "s",
        status,
        durationMs: 10,
        errors: [],
        steps: [
          {
            index: 0,
            input: { message: "Find role" },
            expectation: { type: "interrupt" },
            observation: { type: "interrupt", text: "", structured: [] },
            reference: reference as never,
            status,
            criteria: [],
          },
        ],
      },
    ],
  };
  return data;
}
describe("eval result presentation", () => {
  it("keeps requested attempts queued, excludes unselected cases, and never counts them as passed", () => {
    const rows = caseRows(run());
    expect(rows.map((r) => r.status)).toEqual(["queued", "queued"]);
    expect(progressCounts(rows)).toMatchObject({
      total: 2,
      passed: 0,
      completed: 0,
    });
  });
  it("keeps captured cases awaiting evaluation, replaces step grades, and resolves interrupted grading", () => {
    const data = run();
    data.request = { repetitions: 1, caseIds: ["ambiguity"] };
    const completed = finished("passed").result!.cases[0]!;
    const captured = structuredClone(completed);
    captured.status = "ungraded";
    captured.steps[0]!.status = "ungraded";
    data.events = [
      { id: 1, event: { type: "case-completed", result: captured } },
    ];
    expect(caseRows(data)[0]?.status).toBe("ungraded");
    expect(progressCounts(caseRows(data))).toMatchObject({
      passed: 0,
      completed: 0,
    });
    data.events.push({
      id: 2,
      event: {
        type: "step-completed",
        caseId: "ambiguity",
        repetition: 1,
        step: completed.steps[0]!,
      },
    });
    expect(caseRows(data)[0]?.steps[0]?.status).toBe("passed");
    expect(captured.steps[0]?.status).toBe("ungraded");
    data.events.push({
      id: 3,
      event: { type: "case-completed", result: completed },
    });
    expect(progressCounts(caseRows(data))).toMatchObject({
      passed: 1,
      completed: 1,
    });
    data.events = [
      { id: 1, event: { type: "case-completed", result: captured } },
    ];
    data.status = "cancelled";
    expect(caseRows(data)[0]?.status).toBe("cancelled");
    expect(caseRows(data)[0]?.steps[0]?.status).toBe("cancelled");
    data.status = "error";
    expect(caseRows(data)[0]?.status).toBe("error");
  });
  it("preserves completed evidence while marking started cancellation separately from unstarted attempts", () => {
    const data = run();
    data.status = "cancelled";
    data.events = [
      {
        id: 1,
        event: {
          type: "case-started",
          caseId: "ambiguity",
          repetition: 1,
          sessionId: "s",
        },
      },
    ];
    const rows = caseRows(data);
    expect(rows.map((r) => r.status)).toEqual(["cancelled", "not-run"]);
    expect(progressCounts(rows)).toMatchObject({
      completed: 1,
      total: 2,
      passed: 0,
    });
  });
  it("records improved and regressed rates only with matching recorded context", () => {
    expect(compareRuns(finished("failed"), finished("passed"))[0].change).toBe(
      "improved",
    );
    expect(compareRuns(finished("passed"), finished("failed"))[0].change).toBe(
      "regressed",
    );
  });
  it("compares a failed early stop with a completed continuation without calling it data drift", () => {
    const baseline = finished("failed");
    const candidate = finished("passed");
    for (const value of [baseline, candidate]) {
      value.suite.cases[0].steps.push({
        resume: { type: "select", ids: ["job"] },
        expect: { type: "answer" },
      });
    }
    candidate.result?.cases[0].steps.push({
      index: 1,
      input: { resume: { type: "select", ids: ["job"] } },
      expectation: { type: "answer" },
      observation: { type: "answer", text: "Description", structured: [] },
      status: "passed",
      criteria: [],
    });
    expect(compareRuns(baseline, candidate)[0].change).toBe("improved");
    if (candidate.result)
      candidate.result.cases[0].steps[0].reference = { id: "different" };
    expect(compareRuns(baseline, candidate)[0].change).toBe("changed");
  });
  it("ignores object key order in reference facts but detects data changes", () => {
    expect(
      compareRuns(
        finished("passed", { id: "x", city: "Paris" }),
        finished("passed", { city: "Paris", id: "x" }),
      )[0].change,
    ).toBe("unchanged");
    expect(
      compareRuns(
        finished("passed", { id: "x" }),
        finished("passed", { id: "y" }),
      )[0].change,
    ).toBe("changed");
  });
  it("withholds deltas across graders, actors declared in params, and missing results", () => {
    const other = finished("passed");
    if (other.result?.judge) other.result.judge.version = "2";
    expect(compareRuns(finished("failed"), other)[0].change).toBe("changed");
    const actor = finished("passed");
    actor.suite.cases[0].params = { actor: "admin" };
    expect(compareRuns(finished("failed"), actor)[0].change).toBe("changed");
    expect(compareRuns(finished("passed"), run())[0].change).toBe("incomplete");
  });
});
