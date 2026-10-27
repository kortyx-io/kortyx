import type { EvalIssue, EvalStepResult } from "@kortyx/agent/evals";
import { describe, expect, it } from "vitest";
import { calculateEvalAttemptCosts } from "../src/repositories/eval-costs";
import { evalProjectionCosts } from "../src/repositories/eval-live";
import {
  emptyEvalLiveProjection,
  projectEvalProgress,
} from "../src/repositories/eval-live-projection";

const step = (
  status: EvalStepResult["status"],
  text: string,
): EvalStepResult => ({
  index: 0,
  input: { message: "question" },
  expectation: { type: "answer", criteria: ["Correct"] },
  observation: { type: "answer", text, structured: [] },
  status,
  criteria:
    status === "ungraded"
      ? []
      : [
          {
            id: "correct",
            text: "Correct",
            passed: status === "passed",
            reason: "Checked",
            evidence: [],
          },
        ],
});
describe("compact eval progress", () => {
  it("retains runtime associations when a terminal error omits them, without transferring them to another attempt", () => {
    const projection = emptyEvalLiveProjection();
    projectEvalProgress(projection, {
      type: "case-started",
      caseId: "a",
      repetition: 1,
      sessionId: "session",
      attemptId: "first",
    });
    const execution = { sessionId: "runtime-session", runId: "runtime-run" };
    projectEvalProgress(projection, {
      type: "case-runtime-associated",
      caseId: "a",
      repetition: 1,
      attemptId: "first",
      execution,
    });
    projectEvalProgress(projection, {
      type: "step-completed",
      caseId: "a",
      repetition: 1,
      step: {
        ...step("passed", "answer"),
        judgeCalls: 1,
        judgeUsage: [
          {
            provider: "test",
            model: "judge",
            occurredAt: new Date().toISOString(),
            pricing: {
              source: "provider",
              currency: "USD",
              actualCostMicros: 350,
            },
          },
        ],
      },
    });
    const result = {
      caseId: "a",
      repetition: 1,
      sessionId: "session",
      attemptId: "first",
      status: "error" as const,
      durationMs: 1,
      steps: [],
      errors: [],
    };
    projectEvalProgress(projection, { type: "case-completed", result });
    projectEvalProgress(projection, { type: "case-completed", result });
    expect(Object.values(projection.attempts)[0]?.runtimeExecutions).toEqual([
      execution,
    ]);
    expect(
      Object.values(projection.attempts)[0]?.steps[0]?.judgeUsage,
    ).toHaveLength(1);
    projectEvalProgress(projection, {
      type: "case-completed",
      result: { ...result, attemptId: "second" },
    });
    expect(Object.values(projection.attempts)[0]?.runtimeExecutions).toEqual(
      [],
    );
    expect(Object.values(projection.attempts)[0]?.steps).toEqual([]);
  });

  it("keeps a finished run subtotal incomplete when a case has no billing evidence", () => {
    const projection = emptyEvalLiveProjection();
    for (const caseId of ["priced", "missing"])
      projectEvalProgress(projection, {
        type: "case-completed",
        result: {
          caseId,
          repetition: 1,
          sessionId: caseId,
          status: "error",
          durationMs: 1,
          steps: [],
          errors: [],
        },
      });
    const cases = Object.values(projection.attempts).map((a) => a.summary);
    const [priced, missing] = cases;
    if (!priced || !missing) throw new Error("Expected both billing fixtures");
    priced.costs = calculateEvalAttemptCosts(
      { sessionId: "priced", steps: [], finished: true },
      [
        {
          eventId: "charge",
          type: "generation.completed",
          occurredAt: new Date(),
          environment: "test",
          sessionId: "priced",
          runId: "run",
          payload: {
            pricing: {
              source: "provider",
              currency: "USD",
              actualCostMicros: 500000,
            },
          },
        },
      ],
      [],
    );
    expect(evalProjectionCosts({ cases }, "error")?.total).toMatchObject({
      amount: 0.5,
      status: "partial",
      costSummary: { complete: false },
    });
    expect(
      evalProjectionCosts({ cases: [missing] }, "error")?.total,
    ).toMatchObject({
      amount: null,
      status: "unavailable",
      costSummary: { amounts: [], complete: false },
    });
  });
  it("keeps exception captures in original evidence and only carries a failure preview into live tables", () => {
    const issue: EvalIssue = {
      phase: "grading",
      code: "JUDGE_FAILED",
      message: "x".repeat(3_000),
      exception: {
        schemaVersion: 1,
        data: { output: "SECRET_CAPTURE" },
        capture: { status: "complete", omissions: [], redactions: [] },
      },
    };
    const projection = emptyEvalLiveProjection();
    projectEvalProgress(projection, {
      type: "case-completed",
      result: {
        caseId: "a",
        repetition: 1,
        sessionId: "session",
        status: "error",
        durationMs: 1,
        steps: [],
        errors: [issue],
      },
    });
    const summary = Object.values(projection.attempts)[0]?.summary;
    expect(summary?.errors[0]?.message).toHaveLength(2_001);
    expect(summary?.errors[0]?.message.endsWith("…")).toBe(true);
    expect(JSON.stringify(projection)).not.toContain("SECRET_CAPTURE");
    expect(issue.exception?.data.output).toBe("SECRET_CAPTURE");
  });
  it("retains table facts and billing inputs without copying observations or criterion evidence", () => {
    const projection = emptyEvalLiveProjection();
    projectEvalProgress(projection, {
      type: "case-started",
      caseId: "a",
      repetition: 2,
      sessionId: "session",
    });
    projectEvalProgress(projection, {
      type: "step-completed",
      caseId: "a",
      repetition: 2,
      step: step("ungraded", "large-private-output".repeat(50_000)),
    });
    projectEvalProgress(projection, {
      type: "step-completed",
      caseId: "a",
      repetition: 2,
      step: step("passed", "replacement-private-output"),
    });
    const attempt = Object.values(projection.attempts)[0];
    if (!attempt) throw new Error("Expected the projected attempt.");
    expect(attempt.summary).toMatchObject({
      completedSteps: 1,
      criteriaPassed: 1,
      criteriaTotal: 1,
    });
    expect(attempt.steps).toHaveLength(1);
    expect(JSON.stringify(projection)).not.toContain("private-output");
    expect(JSON.stringify(projection).length).toBeLessThan(2_000);
  });
  it("replaces interim outcomes without double counting and keeps repetitions distinct", () => {
    const projection = emptyEvalLiveProjection();
    for (const status of ["ungraded", "passed", "passed"] as const)
      projectEvalProgress(projection, {
        type: "case-completed",
        result: {
          caseId: "a",
          repetition: 1,
          sessionId: "session-1",
          status,
          durationMs: 10,
          steps: [step(status, "output")],
          errors: [],
        },
      });
    projectEvalProgress(projection, {
      type: "case-completed",
      result: {
        caseId: "a",
        repetition: 2,
        sessionId: "session-2",
        status: "failed",
        durationMs: 12,
        steps: [],
        errors: [],
      },
    });
    expect(
      Object.values(projection.attempts).map((a) => a.summary.status),
    ).toEqual(["passed", "failed"]);
    expect(projection.sessionIds).toEqual(["session-1", "session-2"]);
  });
});
