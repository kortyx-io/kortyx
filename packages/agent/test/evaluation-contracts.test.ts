import { describe, expect, it } from "vitest";
import { StudioEvaluationStartRequestSchema } from "../src/evals/evaluation-contracts";

const request = {
  targetId: "app",
  selection: "all",
  suites: [{ suiteId: "smoke", suiteRevision: "a".repeat(64) }],
};
describe("grouped evaluation request contract", () => {
  it("defaults a minimal launch to the explicit Studio judge and manual trigger", () => {
    expect(StudioEvaluationStartRequestSchema.parse(request)).toMatchObject({
      judge: "studio",
      repetitions: 1,
      concurrency: 1,
      metadata: { source: "manual" },
    });
  });
  it.each([
    [20, true],
    [21, false],
    [0, false],
    [1.5, false],
  ])("validates concurrency %s with success=%s", (concurrency, success) => {
    expect(
      StudioEvaluationStartRequestSchema.safeParse({ ...request, concurrency })
        .success,
    ).toBe(success);
  });
  it("accepts credential-free HTTP(S) deployment metadata", () => {
    expect(
      StudioEvaluationStartRequestSchema.parse({
        ...request,
        metadata: { deploymentUrl: "https://example.com/deployments/123" },
      }).metadata,
    ).toEqual({
      source: "manual",
      deploymentUrl: "https://example.com/deployments/123",
    });
  });
  it.each([
    "invalid",
    "javascript:alert(1)",
    "https://user:password@example.com/job",
  ])("rejects invalid deployment metadata without throwing for %s", (deploymentUrl) => {
    expect(
      StudioEvaluationStartRequestSchema.safeParse({
        ...request,
        metadata: { deploymentUrl },
      }).success,
    ).toBe(false);
  });
  it("accepts Studio-only prompt selections and rejects malformed overrides", () => {
    for (const promptSelection of [
      { type: "live" },
      { type: "single", id: "intent", version: 2 },
      { type: "group", groupId: "8b12e125-f3a2-48ce-a4a9-1d74283cd91b" },
    ])
      expect(
        StudioEvaluationStartRequestSchema.parse({
          ...request,
          promptSelection,
        }).promptSelection,
      ).toEqual(promptSelection);
    expect(
      StudioEvaluationStartRequestSchema.safeParse({
        ...request,
        promptSelection: { type: "single", id: "intent", version: 0 },
      }).success,
    ).toBe(false);
  });
  it("rejects empty selections and accidental unknown fields", () => {
    expect(
      StudioEvaluationStartRequestSchema.safeParse({ ...request, suites: [] })
        .success,
    ).toBe(false);
    expect(
      StudioEvaluationStartRequestSchema.safeParse({
        ...request,
        schedule: "daily",
      }).success,
    ).toBe(false);
  });
});
