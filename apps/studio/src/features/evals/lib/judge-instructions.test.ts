import type { EvalGradingRequest } from "@kortyx/agent/evals";
import { expect, it } from "vitest";
import type { EvalDetail } from "../schema";
import { savedJudgeInstructions } from "./judge-instructions";

type EvalCaseResult = NonNullable<EvalDetail["result"]>["cases"][number];
type EvalStepResult = EvalCaseResult["steps"][number];

const request: EvalGradingRequest = {
  protocol: "eval-verdict-v1",
  messages: [
    { role: "system", content: "Kortyx verdict protocol" },
    { role: "system", content: "Saved application instructions" },
    { role: "user", content: "Rules, criterion and recorded evidence" },
  ],
};
const step = (gradingRequest = request): EvalStepResult => ({
  index: 0,
  input: { message: "Discover a city" },
  expectation: { type: "answer", criteria: ["Reports the recorded city"] },
  observation: { type: "answer", text: "Barcelona", structured: [] },
  status: "passed",
  criteria: [
    {
      id: "city",
      text: "Reports the recorded city",
      passed: true,
      reason: "Correct",
      evidence: [],
      request: gradingRequest,
    },
  ],
});
const completedCase = (steps = [step()]): EvalCaseResult => ({
  caseId: "discovery",
  repetition: 1,
  sessionId: "session",
  status: "passed",
  durationMs: 10,
  errors: [],
  steps,
});
const run = (): EvalDetail => ({
  id: "run",
  targetId: "app",
  targetName: "App",
  environment: "development",
  suiteId: "scribe",
  suiteRevision: "revision",
  status: "running",
  createdAt: "2026-10-23T00:00:00Z",
  startedAt: null,
  endedAt: null,
  error: null,
  cancelRequestedAt: null,
  suite: { id: "scribe", cases: [] },
  result: null,
  events: [],
});
function finish(value: EvalDetail, cases = [completedCase()]) {
  value.status = "passed";
  value.result = {
    id: value.id,
    suiteId: value.suiteId,
    suiteRevision: value.suiteRevision,
    suite: value.suite,
    judge: { id: "saved-model", version: "1" },
    startedAt: value.createdAt,
    durationMs: 10,
    status: "passed",
    counts: { passed: 1, failed: 0, error: 0, cancelled: 0 },
    errors: [],
    cases,
  };
  return value;
}

it("reads all three exact messages from a passed step while the run is unfinished", () => {
  const value = run();
  value.events = [
    {
      id: 1,
      event: {
        type: "step-completed",
        caseId: "discovery",
        repetition: 1,
        step: step(),
      },
    },
  ];
  const saved = savedJudgeInstructions(value);
  expect(saved.judge).toBeUndefined();
  expect(saved.snapshotPending).toBe(true);
  expect(saved.recordedRequests).toHaveLength(1);
  expect(saved.recordedRequests[0]?.request).toEqual(request);
});

it.each([
  "error",
  "cancelled",
] as const)("keeps completed grading calls after an interrupted %s execution", (status) => {
  const value = run();
  value.status = status;
  value.events = [
    { id: 1, event: { type: "case-completed", result: completedCase() } },
  ];
  const saved = savedJudgeInstructions(value);
  expect(saved.recordedRequests[0]?.request.messages).toEqual(request.messages);
  expect(saved.snapshotPending).toBe(false);
});

it("deduplicates progress copies, prefers final grading evidence and isolates the selected attempt", () => {
  const value = run();
  value.events = [
    {
      id: 1,
      event: {
        type: "step-completed",
        caseId: "discovery",
        repetition: 1,
        step: step(),
      },
    },
    { id: 2, event: { type: "case-completed", result: completedCase() } },
    {
      id: 3,
      event: {
        type: "step-completed",
        caseId: "another-case",
        repetition: 1,
        step: step(),
      },
    },
    {
      id: 4,
      event: {
        type: "step-completed",
        caseId: "discovery",
        repetition: 2,
        step: step(),
      },
    },
  ];
  const finalRequest = {
    ...request,
    messages: [{ role: "user" as const, content: "Final saved request" }],
  };
  finish(value, [completedCase([step(finalRequest)])]);
  const saved = savedJudgeInstructions(value, {
    caseId: "discovery",
    repetition: 1,
  });
  expect(saved.recordedRequests).toHaveLength(1);
  expect(saved.recordedRequests[0]?.request).toEqual(finalRequest);
  expect(saved.snapshotPending).toBe(false);
  expect(savedJudgeInstructions(value).recordedRequests).toHaveLength(3);
});

it("prefers the final saved judge snapshot over rendered grading requests", () => {
  const value = finish(run());
  if (!value.result) throw new Error("Expected the final result");
  value.result.judge = {
    id: "saved-model",
    version: "1",
    instructions: "The saved snapshot",
  };
  const saved = savedJudgeInstructions(value);
  expect(saved.judge?.instructions).toBe("The saved snapshot");
  expect(saved.recordedRequests).toEqual([]);
  expect(saved.snapshotPending).toBe(false);
});

it("does not turn configured or queued instructions into a historical snapshot", () => {
  const oldStep = step();
  const criterion = oldStep.criteria[0];
  if (!criterion) throw new Error("Expected the historical criterion");
  delete criterion.request;
  const value = finish(run(), [completedCase([oldStep])]);
  value.request = {
    repetitions: 1,
    judge: {
      id: "queued-model",
      version: "1",
      instructions: "Queued instructions are not proof of execution",
    },
  };
  value.suite.judge = {
    id: "declared-model",
    version: "2",
    instructions: "Declared instructions are not proof of execution",
  };
  const saved = savedJudgeInstructions(value);
  expect(saved.judge).toEqual({ id: "saved-model", version: "1" });
  expect(saved.recordedRequests).toEqual([]);
  expect(saved.snapshotPending).toBe(false);
});

it.each([
  "queued",
  "running",
] as const)("distinguishes an unfinished %s snapshot from missing historical instructions", (status) => {
  const value = run();
  value.status = status;
  expect(savedJudgeInstructions(value)).toMatchObject({
    snapshotPending: true,
    recordedRequests: [],
  });
});
