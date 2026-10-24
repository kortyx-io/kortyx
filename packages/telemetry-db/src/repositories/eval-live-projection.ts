import { randomUUID } from "node:crypto";
import type {
  EvalCaseResult,
  EvalIssue,
  EvalStepResult,
  StudioEvalCaseSummary,
  StudioEvalDetail,
} from "@kortyx/agent/evals";

type RecordedCase = NonNullable<StudioEvalDetail["result"]>["cases"][number];
type RecordedProgress = StudioEvalDetail["events"][number]["event"];

export type ProjectionStep = Pick<
  RecordedCase["steps"][number],
  "index" | "status" | "reason" | "judgeCalls" | "judgeUsage"
> & {
  criteria: readonly { passed: boolean }[];
  expectation: { criteria?: readonly unknown[] | undefined };
};
export type ProjectionCase = Omit<RecordedCase, "steps" | "verification"> & {
  steps: ProjectionStep[];
};
export type ProjectionProgress =
  | Exclude<RecordedProgress, { type: "step-completed" | "case-completed" }>
  | {
      type: "step-completed";
      caseId: string;
      repetition: number;
      step: ProjectionStep;
    }
  | { type: "case-completed"; result: ProjectionCase };
type Step = {
  index: number;
  status: EvalStepResult["status"];
  criteriaPassed: number;
  criteriaTotal: number;
  reason?: string;
  judgeCalls: number;
  judgeUsage: NonNullable<EvalStepResult["judgeUsage"]>;
};
export type Attempt = {
  summary: StudioEvalCaseSummary;
  attemptId?: string | undefined;
  runtimeExecutions: { sessionId: string; runId: string }[];
  steps: Step[];
};
export type EvalLiveProjection = {
  revision: number;
  attempts: Record<string, Attempt>;
  attemptIds: string[];
  sessionIds: string[];
  dirtyBilling?: Record<string, boolean>;
  errors: EvalCaseResult["errors"];
  pricingVersion?: string;
};
export const emptyEvalLiveProjection = (): EvalLiveProjection => ({
  revision: 0,
  attempts: {},
  attemptIds: [],
  sessionIds: [],
  errors: [],
});
const keyOf = (caseId: string, repetition: number) =>
  JSON.stringify([caseId, repetition]);
const preview = (text: string) =>
  text.length > 2_000 ? `${text.slice(0, 2_000)}…` : text;
export const compactIssue = (
  issue: RecordedCase["errors"][number],
): EvalIssue => ({
  phase: issue.phase,
  code: issue.code,
  message: preview(issue.message),
  ...(issue.diagnosticId ? { diagnosticId: issue.diagnosticId } : {}),
});
const compactStep = (step: ProjectionStep): Step => ({
  index: step.index,
  status: step.status,
  criteriaPassed: step.criteria.filter((c) => c.passed).length,
  criteriaTotal: step.criteria.length,
  ...(step.reason ? { reason: preview(step.reason) } : {}),
  judgeCalls:
    step.judgeCalls ??
    (step.status === "ungraded"
      ? 0
      : step.criteria.length +
        (step.status === "error" && step.expectation.criteria?.length ? 1 : 0)),
  judgeUsage: step.judgeUsage ?? [],
});
const summarizeSteps = (attempt: Attempt) => {
  attempt.summary.completedSteps = attempt.steps.length;
  attempt.summary.criteriaPassed = attempt.steps.reduce(
    (sum, s) => sum + s.criteriaPassed,
    0,
  );
  attempt.summary.criteriaTotal = attempt.steps.reduce(
    (sum, s) => sum + s.criteriaTotal,
    0,
  );
  attempt.summary.failures = attempt.steps
    .filter((s) => s.status === "failed" || s.status === "error")
    .flatMap((s) => (s.reason ? [s.reason] : []));
};
const rememberIdentities = (projection: EvalLiveProjection) => {
  projection.attemptIds = [
    ...new Set(
      Object.values(projection.attempts).flatMap((a) =>
        a.attemptId ? [a.attemptId] : [],
      ),
    ),
  ];
  projection.sessionIds = [
    ...new Set(
      Object.values(projection.attempts).flatMap((a) =>
        !a.attemptId && a.summary.sessionId ? [a.summary.sessionId] : [],
      ),
    ),
  ];
};
/** Replacement by step/case identity makes grading updates and duplicate progress idempotent. */
export function projectEvalProgress(
  projection: EvalLiveProjection,
  event: ProjectionProgress,
): string | undefined {
  if (event.type === "run-started") return;
  const identity = event.type === "case-completed" ? event.result : event;
  const key = keyOf(identity.caseId, identity.repetition);
  projection.attempts[key] ??= {
    summary: {
      caseId: identity.caseId,
      repetition: identity.repetition,
      status: "queued",
      completedSteps: 0,
      criteriaPassed: 0,
      criteriaTotal: 0,
      failures: [],
      errors: [],
    },
    runtimeExecutions: [],
    steps: [],
  };
  const attempt = projection.attempts[key];
  if (
    event.type === "case-dispatch" &&
    !["passed", "failed", "error", "cancelled"].includes(attempt.summary.status)
  ) {
    attempt.summary.status = event.status;
    delete attempt.summary.retryAt;
    delete attempt.summary.httpStatus;
    if (event.retryAt) attempt.summary.retryAt = event.retryAt;
    if (event.httpStatus) attempt.summary.httpStatus = event.httpStatus;
  }
  if (
    event.type === "case-started" &&
    !(
      attempt.summary.sessionId === event.sessionId &&
      attempt.attemptId === event.attemptId
    )
  ) {
    attempt.summary = {
      caseId: event.caseId,
      repetition: event.repetition,
      status: "running",
      sessionId: event.sessionId,
      completedSteps: 0,
      criteriaPassed: 0,
      criteriaTotal: 0,
      failures: [],
      errors: [],
    };
    attempt.attemptId = event.attemptId;
    attempt.runtimeExecutions = [];
    attempt.steps = [];
  }
  if (
    event.type === "case-runtime-associated" &&
    event.attemptId === attempt.attemptId &&
    !attempt.runtimeExecutions.some(
      (r) =>
        r.runId === event.execution.runId &&
        r.sessionId === event.execution.sessionId,
    )
  )
    attempt.runtimeExecutions.push(event.execution);
  if (event.type === "case-progress") attempt.summary.phase = event.phase;
  if (event.type === "step-completed") {
    attempt.steps = [
      ...attempt.steps.filter((s) => s.index !== event.step.index),
      compactStep(event.step),
    ];
    summarizeSteps(attempt);
  }
  if (event.type === "case-completed") {
    const result = event.result;
    attempt.summary = {
      caseId: result.caseId,
      repetition: result.repetition,
      status: result.status,
      sessionId: result.sessionId,
      durationMs: result.durationMs,
      ...(result.phaseDurationsMs
        ? { phaseDurationsMs: result.phaseDurationsMs }
        : {}),
      completedSteps: 0,
      criteriaPassed: 0,
      criteriaTotal: 0,
      failures: [],
      errors: result.errors.map(compactIssue),
    };
    attempt.attemptId = result.attemptId;
    attempt.runtimeExecutions = result.runtimeExecutions ?? [];
    attempt.steps = result.steps.map(compactStep);
    summarizeSteps(attempt);
  }
  rememberIdentities(projection);
  attempt.summary.evidenceVersion = randomUUID();
  return key;
}
