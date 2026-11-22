import {
  ASSESSMENT_SCORE_GROUP,
  DEFAULT_JUDGE_CONTENT,
} from "@kortyx/telemetry-contracts";
import type { TelemetryDb } from "@kortyx/telemetry-db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvaluatorModelService } from "../src/evaluators/model";
import { createEvaluatorWorker } from "../src/evaluators/worker";

const store = vi.hoisted(() => ({
  claim: vi.fn(),
  authorize: vi.fn(),
  finish: vi.fn(),
  price: vi.fn(),
}));
vi.mock("@kortyx/telemetry-db", () => ({
  claimEvaluatorExecution: store.claim,
  ensureProjectEnvironmentAllowed: store.authorize,
  finishEvaluatorExecution: store.finish,
  priceEvaluatorUsage: store.price,
}));
const usage = {
  inputTokens: 100,
  outputTokens: 30,
  costUsd: null,
  costSource: "unavailable" as const,
};
const job = (group = true) => ({
  id: "preview-1",
  source: "version",
  snapshot: {
    definition: {
      name: "Judge",
      description: "",
      model: "test/model",
      content: DEFAULT_JUDGE_CONTENT,
      evidence: "response",
    },
    ...(group ? { scoreGroup: structuredClone(ASSESSMENT_SCORE_GROUP) } : {}),
  },
  renderedMessages: [{ role: "user", content: "Captured answer" }],
});
const valid = {
  assessment: {
    status: "scored",
    value: "The label matches the captured request.",
    reason: "The request asks for help.",
    evidence: ["support"],
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  store.claim.mockResolvedValue(job());
  store.authorize.mockResolvedValue(undefined);
  store.finish.mockResolvedValue(true);
});
describe("judge score-group execution", () => {
  it("requests the pinned schema and persists a typed result without a pass/fail verdict", async () => {
    const invoke = vi.fn<EvaluatorModelService["invoke"]>(
      async (_model, _messages, _signal, onUsage) => {
        onUsage(usage);
        return valid;
      },
    );
    await createEvaluatorWorker(
      {} as TelemetryDb,
      { models: ["test/model"], invoke },
      undefined,
      { usage: false },
    ).tick();
    expect(invoke.mock.calls[0]?.[4]).toMatchObject({
      type: "object",
      required: ["assessment"],
      additionalProperties: false,
    });
    expect(store.finish).toHaveBeenCalledWith(
      expect.anything(),
      "preview-1",
      expect.any(String),
      {
        status: "completed",
        result: { group: ASSESSMENT_SCORE_GROUP, fields: valid },
        usage,
      },
    );
  });
  it("rejects invalid output atomically, retains usage and excludes response values from errors", async () => {
    const invoke = vi.fn<EvaluatorModelService["invoke"]>(
      async (_model, _messages, _signal, onUsage) => {
        onUsage(usage);
        return { ...valid, unexpected: "private response content" };
      },
    );
    await createEvaluatorWorker(
      {} as TelemetryDb,
      { models: ["test/model"], invoke },
      undefined,
      { usage: false },
    ).tick();
    const outcome = store.finish.mock.calls[0]?.[3];
    expect(outcome).toMatchObject({ status: "error", usage });
    expect(outcome.result).toBeUndefined();
    expect(outcome.error).toContain("configured fields");
    expect(outcome.error).not.toContain("private response content");
  });
  it("retains the original output contract for saved legacy judge versions", async () => {
    store.claim.mockResolvedValue(job(false));
    const verdict = { passed: true, reason: "Correct", evidence: ["support"] };
    const invoke = vi.fn().mockResolvedValue(verdict);
    await createEvaluatorWorker(
      {} as TelemetryDb,
      { models: ["test/model"], invoke },
      undefined,
      { usage: false },
    ).tick();
    expect(store.finish.mock.calls[0]?.[3]).toEqual({
      status: "completed",
      verdict,
      usage: null,
    });
  });
  it("does not call the model when the recording environment is denied", async () => {
    store.authorize.mockRejectedValue(new Error("Denied"));
    const invoke = vi.fn();
    await createEvaluatorWorker(
      {} as TelemetryDb,
      { models: [], invoke },
      undefined,
      { usage: false },
    ).tick();
    expect(invoke).not.toHaveBeenCalled();
    expect(store.finish.mock.calls[0]?.[3]).toMatchObject({
      status: "error",
      usage: null,
    });
  });
});
