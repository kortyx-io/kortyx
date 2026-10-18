import { SAMPLE_PROJECT } from "@kortyx/telemetry-contracts";
import { afterEach, expect, it, vi } from "vitest";
import { createSampleProjectReadModels } from "../src/sample-project";

afterEach(() => vi.useRealTimers());

it("keeps the recorded sample deterministic even years after its reference clock", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:10:00Z"));
  const recorded = createSampleProjectReadModels();
  vi.setSystemTime(new Date("2040-01-01T00:00:00Z"));
  expect(createSampleProjectReadModels()).toEqual(recorded);
  expect(
    recorded.workflows.workflows.every(
      (workflow) => workflow.health !== "idle",
    ),
  ).toBe(true);
  expect(
    recorded.interrupts.filter((interrupt) => interrupt.status === "pending"),
  ).toHaveLength(2);
});

it("projects observed specialist calls once, including resumed and reused executions", () => {
  const models = createSampleProjectReadModels();
  expect(models.runs).toHaveLength(50);
  expect(models.sessions).toHaveLength(20);
  expect(models.childRuns).toHaveLength(55);
  const calls = models.workflows.observedCalls ?? [];
  expect(calls).toHaveLength(2);
  expect(calls.map((call) => call.volume).sort((a, b) => a - b)).toEqual([
    17, 38,
  ]);
  expect(calls.reduce((sum, call) => sum + call.volume, 0)).toBe(
    models.childRuns.length,
  );
  for (const call of calls) {
    expect(models.runs.some((run) => run.id === call.runId)).toBe(true);
    expect(
      models.childRuns.some(
        (run) =>
          run.parentRunId === call.runId &&
          run.invocationId === call.invocationId,
      ),
    ).toBe(true);
  }
  const approved = createSampleProjectReadModels({
    runIds: [SAMPLE_PROJECT.runs.approval],
  });
  expect(approved.runs).toHaveLength(1);
  expect(approved.childRuns).toHaveLength(2);
  expect(approved.runs[0]?.path).toEqual(["answer"]);
  expect(approved.childRuns.map((run) => run.path)).toEqual([
    ["research"],
    ["resolution", "approveRefund"],
  ]);
  expect(
    approved.detailEvents
      .filter((event) => event.type === "workflow.call.started")
      .every((event) => event.payload.parentInvocationId === null),
  ).toBe(true);
  expect(approved.workflows.observedCalls?.map((call) => call.volume)).toEqual([
    1, 1,
  ]);
  expect(
    approved.workflows.workflows.find(
      (workflow) => workflow.id === SAMPLE_PROJECT.workflowId,
    )?.metrics.runCount,
  ).toBe(1);
});
