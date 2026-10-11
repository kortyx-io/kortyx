import type { EvalCaseResult, EvalProgress } from "@kortyx/agent/evals";
import { describe, expect, it } from "vitest";
import {
  evaluationRequestHash,
  summarizeEvaluation,
} from "../src/repositories/evaluations";
import type { evalRuns, evaluationRuns } from "../src/schema";

const now = new Date("2026-10-07T10:00:00Z");
const parent: typeof evaluationRuns.$inferSelect = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "org",
  projectId: "project",
  environment: "staging",
  targetId: "app",
  targetName: "Application",
  name: "All suites",
  request: {
    targetId: "app",
    selection: "all",
    suites: [{ suiteId: "suite", suiteRevision: "revision" }],
  },
  requestHash: "hash",
  idempotencyKey: null,
  requestedBy: "test",
  cancelRequestedAt: null,
  createdAt: now,
};
function child(
  id: string,
  status: typeof evalRuns.$inferSelect.status,
): typeof evalRuns.$inferSelect {
  return {
    ...parent,
    id,
    evaluationId: parent.id,
    suiteId: id,
    suiteRevision: "revision",
    suite: {
      id,
      cases: [
        {
          id: "answer",
          steps: [
            {
              message: "Hello",
              expect: { type: "answer", criteria: ["Responds"] },
            },
          ],
        },
      ],
    },
    request: {
      suiteId: id,
      suiteRevision: "revision",
      repetitions: 1,
      concurrency: 1,
    },
    status,
    result: null,
    error: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    startedAt: status === "queued" ? null : now,
    endedAt: status === "running" || status === "queued" ? null : now,
    updatedAt: now,
  };
}
function completed(status: EvalCaseResult["status"]): EvalProgress {
  return {
    type: "case-completed",
    result: {
      caseId: "answer",
      repetition: 1,
      sessionId: "session",
      status,
      durationMs: 1,
      steps: [],
      errors: [],
    },
  };
}
describe("evaluation aggregation", () => {
  it("keeps execution running through ungraded evidence and deduplicates grading updates", () => {
    const children = [child("first", "running"), child("second", "queued")];
    const events = new Map([["first", [completed("ungraded")]]]);
    let run = summarizeEvaluation(parent, children, events, new Map());
    expect(run.status).toBe("running");
    expect(run.completedAttempts).toBe(0);
    expect(run.endedAt).toBeNull();
    events
      .get("first")!
      .push(completed("failed"), completed("passed"), completed("passed"));
    run = summarizeEvaluation(parent, children, events, new Map());
    expect(run.completedAttempts).toBe(1);
    expect(run.totalAttempts).toBe(2);
    expect(run.counts).toEqual({
      passed: 1,
      failed: 0,
      error: 0,
      cancelled: 0,
    });
    expect(run.completedSuites).toBe(0);
  });
  it("waits for every suite, retaining errors and completed results through cancellation", () => {
    const children = [child("first", "error"), child("second", "running")];
    expect(
      summarizeEvaluation(parent, children, new Map(), new Map()).status,
    ).toBe("running");
    children[1] = child("second", "cancelled");
    const run = summarizeEvaluation(parent, children, new Map(), new Map());
    expect(run.status).toBe("error");
    expect(run.completedSuites).toBe(2);
    expect(run.endedAt).toBe(now.toISOString());
  });
  it("hashes equivalent JSON property order consistently while detecting changed selections", () => {
    expect(
      evaluationRequestHash({ suites: ["one", "two"], targetId: "app" }),
    ).toBe(evaluationRequestHash({ targetId: "app", suites: ["one", "two"] }));
    expect(evaluationRequestHash({ suites: ["one"] })).not.toBe(
      evaluationRequestHash({ suites: ["two"] }),
    );
  });
});
