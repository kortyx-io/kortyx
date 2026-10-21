import { createHash } from "node:crypto";
import {
  DiagnosticResponseSchema,
  SAMPLE_PROJECT,
} from "@kortyx/telemetry-contracts";
import { afterEach, expect, it, vi } from "vitest";
import { createSampleProjectReadModels } from "../src/sample-project";

afterEach(() => vi.useRealTimers());

it("provides complete correlated diagnostics for every runtime fault, including recovered tool failures", () => {
  const models = createSampleProjectReadModels();
  expect(models.diagnostics).toHaveLength(6);
  const diagnostics = new Map(
    models.diagnostics.map((entry) => [entry.manifest.diagnosticId, entry]),
  );
  for (const diagnostic of models.diagnostics) {
    DiagnosticResponseSchema.parse(diagnostic);
    expect(diagnostic.state).toBe("available");
    expect(diagnostic.content?.capture.status).toBe("complete");
    const content = diagnostic.content;
    if (!content) throw new Error("Missing sample diagnostic content.");
    expect(content.data.stack).toMatch(
      /at execute \(sample-support\/src\/.+\.ts:\d+:\d+\)/,
    );
    expect(content.data.cause).toMatchObject({
      type: expect.any(String),
      stack: expect.stringContaining("at readResponse"),
    });
    const bytes = JSON.stringify(content);
    expect(diagnostic.manifest.checksum).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(diagnostic.contentChecksum).toBe(diagnostic.manifest.checksum);
    expect(diagnostic.contentByteLength).toBe(Buffer.byteLength(bytes));
    expect(diagnostic.receivedParts).toBe(diagnostic.manifest.partCount);
    const correlation = diagnostic.manifest.correlation;
    expect(
      models.runs.some(
        (run) =>
          run.id === correlation.runId &&
          run.sessionId === correlation.sessionId,
      ),
    ).toBe(true);
    const revision = models.workflows.workflows.find(
      (workflow) => workflow.id === correlation.workflowId,
    );
    expect(revision).toBeDefined();
    if (content.data.provider || content.data.carrier) {
      expect(JSON.stringify(content)).not.toContain(
        "synthetic-placeholder-never-a-real-credential",
      );
      expect(content.capture.redactions.length).toBeGreaterThan(0);
    }
  }
  const faults = models.detailEvents.filter((event) =>
    ["span.failed", "tool.failed", "workflow.call.failed"].includes(event.type),
  );
  expect(faults.length).toBeGreaterThan(diagnostics.size);
  for (const event of faults) {
    const diagnostic = diagnostics.get(String(event.payload.diagnosticId));
    expect(diagnostic, event.id).toBeDefined();
    expect(diagnostic?.manifest.correlation.runId).toBe(event.runId);
  }
  for (const run of models.runs.filter((run) => run.status === "failed"))
    expect(
      models.diagnostics.some(
        (entry) =>
          entry.manifest.correlation.runId === run.id &&
          !entry.manifest.handled,
      ),
    ).toBe(true);
  const recovered = models.diagnostics.filter(
    (entry) => entry.manifest.handled,
  );
  expect(recovered).toHaveLength(1);
  expect(
    models.runs.find(
      (run) => run.id === recovered[0]?.manifest.correlation.runId,
    )?.status,
  ).toBe("completed");
  expect(recovered[0]?.manifest.severity).toBe("warning");
  expect(recovered[0]?.content?.data.details).toMatchObject({
    recovery: expect.stringContaining("retry succeeded"),
  });
  for (const entry of models.diagnostics.filter(
    (entry) => entry.manifest.summary.type === "ExecutionLimitReached",
  ))
    expect(entry.content?.data.details).toHaveProperty("limit");
});

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
  expect(models.runs).toHaveLength(58);
  expect(models.sessions).toHaveLength(25);
  expect(models.childRuns).toHaveLength(65);
  const calls = models.workflows.observedCalls ?? [];
  expect(calls).toHaveLength(2);
  expect(calls.map((call) => call.volume).sort((a, b) => a - b)).toEqual([
    19, 46,
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
