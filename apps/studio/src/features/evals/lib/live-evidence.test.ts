import type { StudioEvalLiveDetail } from "@kortyx/agent/evals";
import { describe, expect, it } from "vitest";
import type { EvalDetail } from "../schema";
import { mergeEvalLiveState, needsEvalEvidence } from "./live-evidence";

const detail: EvalDetail = {
  id: "run",
  targetId: "app",
  targetName: "App",
  environment: "test",
  suiteId: "suite",
  suiteRevision: "revision",
  status: "running",
  createdAt: "2026-10-20T00:00:00Z",
  startedAt: null,
  endedAt: null,
  error: null,
  cancelRequestedAt: null,
  suite: { id: "suite", cases: [] },
  result: null,
  events: [],
  caseVersion: "case-v1",
};
const state: Omit<StudioEvalLiveDetail, "suite" | "request"> = {
  ...detail,
  version: "live-v1",
  errors: [],
  cases: [
    {
      caseId: "a",
      repetition: 1,
      status: "running",
      evidenceVersion: "case-v1",
      completedSteps: 1,
      criteriaPassed: 0,
      criteriaTotal: 0,
      errors: [],
      failures: [],
    },
  ],
};
describe("live evidence reads", () => {
  it("leaves evidence in place for costs and other cases, and fetches only when the opened attempt changes", () => {
    const selected = { caseId: "a", repetition: 1 };
    const firstCase = state.cases[0];
    if (!firstCase) throw new Error("Expected the case fixture.");
    expect(needsEvalEvidence(detail, state, selected)).toBe(false);
    const another = {
      ...state,
      cases: [
        ...state.cases,
        { ...firstCase, caseId: "b", evidenceVersion: "b-v2" },
      ],
    };
    expect(needsEvalEvidence(detail, another, selected)).toBe(false);
    expect(
      needsEvalEvidence(
        detail,
        {
          ...state,
          cases: [{ ...firstCase, evidenceVersion: "case-v2" }],
        },
        selected,
      ),
    ).toBe(true);
    const merged = mergeEvalLiveState(detail, another);
    expect(merged.events).toBe(detail.events);
    expect(merged.suite).toBe(detail.suite);
    expect(merged).not.toHaveProperty("cases");
  });
  it("loads final comparison evidence once after an active run finishes, keeping saved results stable on unrelated notifications", () => {
    const finished = { ...state, status: "passed" as const };
    expect(needsEvalEvidence(detail, finished)).toBe(true);
    expect(needsEvalEvidence({ ...detail, status: "passed" }, finished)).toBe(
      false,
    );
  });
});
