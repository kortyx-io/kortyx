import { getEvalSuiteRevision } from "@kortyx/agent";
import {
  EvalRunResultSchema,
  EvalSuiteSchema,
  StudioEvalDetailSchema,
  StudioEvalTargetsResponseSchema,
  StudioEvaluationDetailSchema,
} from "@kortyx/agent/evals";
import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";

export function createSampleEvaluations() {
  const suite = EvalSuiteSchema.parse({
    id: sample.suiteId,
    name: "Support quality",
    cases: [
      {
        id: sample.caseId,
        name: "Answer an order question",
        steps: [
          {
            message: "Where is order SAMPLE-42?",
            expect: {
              type: "answer",
              criteria: ["The answer gives the order's delivery status."],
            },
          },
        ],
      },
    ],
  });
  const suiteRevision = getEvalSuiteRevision(suite);
  const result = EvalRunResultSchema.parse({
    id: sample.evalRunId,
    suiteId: suite.id,
    suiteRevision,
    suite,
    judge: { id: "sample-delivery-status", version: "1" },
    startedAt: sample.recordedAt,
    durationMs: 900,
    status: "passed",
    counts: { passed: 1, failed: 0, error: 0, cancelled: 0 },
    errors: [],
    cases: [
      {
        caseId: sample.caseId,
        repetition: 1,
        sessionId: sample.sessions.success,
        status: "passed",
        durationMs: 900,
        errors: [],
        steps: [
          {
            index: 0,
            input: { message: "Where is order SAMPLE-42?" },
            expectation: suite.cases[0]?.steps[0]?.expect,
            observation: {
              type: "answer",
              text: "Order SAMPLE-42 is on its way and arrives tomorrow.",
              structured: [],
              runId: sample.runs.success,
            },
            status: "passed",
            criteria: [
              {
                id: "0",
                text: "The answer gives the order's delivery status.",
                passed: true,
                reason:
                  "The recorded sample answer includes the delivery status.",
                evidence: ["arrives tomorrow"],
              },
            ],
          },
        ],
      },
    ],
  });
  const detail = StudioEvalDetailSchema.parse({
    run: {
      id: sample.evalRunId,
      evaluationId: sample.evaluationId,
      targetId: sample.targetId,
      targetName: "Sample support application",
      environment: "sample",
      suiteId: suite.id,
      suiteRevision,
      suiteName: suite.name,
      status: "passed",
      createdAt: sample.recordedAt,
      startedAt: sample.recordedAt,
      endedAt: "2026-10-01T12:00:00.900Z",
      error: null,
      cancelRequestedAt: null,
      counts: result.counts,
      totalAttempts: 1,
      completedAttempts: 1,
      suite,
      result,
      events: [],
      request: { repetitions: 1 },
    },
  });
  const evaluation = StudioEvaluationDetailSchema.parse({
    run: {
      id: sample.evaluationId,
      name: "Support quality — recorded sample",
      targetId: sample.targetId,
      targetName: "Sample support application",
      environment: "sample",
      selection: "all",
      metadata: { source: "manual" },
      status: "passed",
      createdAt: sample.recordedAt,
      startedAt: sample.recordedAt,
      endedAt: detail.run.endedAt,
      cancelRequestedAt: null,
      suiteCount: 1,
      completedSuites: 1,
      totalAttempts: 1,
      completedAttempts: 1,
      counts: result.counts,
      suites: [detail.run],
    },
  });
  const targets = StudioEvalTargetsResponseSchema.parse({
    canRun: false,
    targets: [
      {
        id: sample.targetId,
        name: "Sample support application",
        environment: "sample",
        error: null,
        manifest: {
          schemaVersion: 1,
          suites: [suite],
          responders: [],
          references: [],
        },
        revisions: { [suite.id]: suiteRevision },
      },
    ],
  });
  const baselineResult = EvalRunResultSchema.parse({
    ...result,
    id: sample.baselineEvalRunId,
    startedAt: "2026-10-01T11:59:00.000Z",
    status: "failed",
    counts: { passed: 0, failed: 1, error: 0, cancelled: 0 },
    cases: result.cases.map((entry) => ({
      ...entry,
      sessionId: sample.sessions.baseline,
      status: "failed",
      steps: entry.steps.map((step) => ({
        ...step,
        status: "failed",
        observation: {
          type: "answer",
          text: "I cannot tell you when the order arrives.",
          structured: [],
          runId: sample.runs.baseline,
        },
        criteria: step.criteria.map((criterion) => ({
          ...criterion,
          passed: false,
          reason: "The recorded baseline answer omits the delivery status.",
          evidence: ["cannot tell you"],
        })),
      })),
    })),
  });
  const baseline = StudioEvalDetailSchema.parse({
    run: {
      ...detail.run,
      id: sample.baselineEvalRunId,
      evaluationId: null,
      createdAt: "2026-10-01T11:59:00.000Z",
      startedAt: "2026-10-01T11:59:00.000Z",
      endedAt: "2026-10-01T11:59:00.900Z",
      status: "failed",
      counts: baselineResult.counts,
      result: baselineResult,
    },
  });
  return { detail, baseline, evaluation, targets };
}
