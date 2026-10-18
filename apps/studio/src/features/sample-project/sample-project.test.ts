import {
  StudioEvalDetailSchema,
  StudioEvalTargetsResponseSchema,
  StudioEvaluationDetailSchema,
} from "@kortyx/agent/evals";
import {
  PromptDetailSchema,
  PromptLibrarySchema,
  StudioContextResponseSchema,
  StudioInterruptDetailResponseSchema,
  StudioInterruptsResponseSchema,
  StudioRunDetailResponseSchema,
  StudioRunsResponseSchema,
  StudioSessionDetailResponseSchema,
  StudioSessionsResponseSchema,
  StudioWorkflowsResponseSchema,
  SAMPLE_PROJECT as sample,
} from "@kortyx/telemetry-contracts";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readSampleDataset } from "./data";
import { sampleResponse } from "./http";

afterEach(() => vi.unstubAllGlobals());
it("projects successful, failed and approved executions from canonical events", () => {
  const data = readSampleDataset();
  expect(data.runs.map((run) => [run.id, run.status])).toEqual([
    [sample.runs.followUp, "completed"],
    [sample.runs.approval, "completed"],
    [sample.runs.failure, "failed"],
    [sample.runs.success, "completed"],
    [sample.runs.baseline, "completed"],
  ]);
  expect(data.sessions).toHaveLength(4);
  expect(data.interrupts).toHaveLength(1);
  expect(data.interrupts[0]).toMatchObject({
    id: sample.interruptId,
    status: "resolved",
    runId: sample.runs.approval,
    resumeToken: null,
  });
  expect(data.runs.find((run) => run.id === sample.runs.success)).toMatchObject(
    { tokens: 300, hasTool: true },
  );
  expect(
    data.runs.find((run) => run.id === sample.runs.failure)?.result,
  ).toContain("timed out");
  for (const run of data.runs) {
    expect(data.sessions.some((session) => session.id === run.sessionId)).toBe(
      true,
    );
    expect(
      data.workflows.workflows.some(
        (workflow) => workflow.id === run.workflowId,
      ),
    ).toBe(true);
  }
});
it("validates every supported read against its real consumer schema", async () => {
  const cases = [
    ["context", StudioContextResponseSchema],
    ["runs", StudioRunsResponseSchema],
    [`runs/${sample.runs.failure}`, StudioRunDetailResponseSchema],
    ["sessions", StudioSessionsResponseSchema],
    [`sessions/${sample.sessions.success}`, StudioSessionDetailResponseSchema],
    ["interrupts", StudioInterruptsResponseSchema],
    [`interrupts/${sample.interruptId}`, StudioInterruptDetailResponseSchema],
    ["workflows", StudioWorkflowsResponseSchema],
    ["prompts", PromptLibrarySchema],
    [`prompts/assets/${sample.promptId}`, PromptDetailSchema],
    ["evals/targets", StudioEvalTargetsResponseSchema],
    [`evals/runs/${sample.evalRunId}`, StudioEvalDetailSchema],
    [`evals/evaluations/${sample.evaluationId}`, StudioEvaluationDetailSchema],
  ] as const;
  const network = vi.fn(() => {
    throw new Error("Sample data must not access the network.");
  });
  vi.stubGlobal("fetch", network);
  for (const [path, schema] of cases) {
    const response = sampleResponse(`/v1/studio/${path}`);
    expect(response.status, path).toBe(200);
    expect(schema.safeParse(await response.json()).success, path).toBe(true);
  }
  expect(network).not.toHaveBeenCalled();
});
it("filters and paginates against the fixed sample clock", async () => {
  const filtered = await sampleResponse("/v1/studio/runs?status=failed").json();
  expect(filtered.totalCount).toBe(1);
  expect(filtered.runs[0].id).toBe(sample.runs.failure);
  expect(
    (await sampleResponse("/v1/studio/runs?env=production").json()).runs,
  ).toEqual([]);
  expect(
    (await sampleResponse("/v1/studio/runs?pageSize=1&cursor=1").json()).runs,
  ).toHaveLength(1);
  expect(
    (await sampleResponse("/v1/studio/runs?range=24%20hours").json())
      .totalCount,
  ).toBe(5);
  expect(
    (
      await sampleResponse(
        "/v1/studio/runs?range=Custom%20range&startedAfter=2026-10-02T00:00:00Z&startedBefore=2026-10-03T00:00:00Z",
      ).json()
    ).totalCount,
  ).toBe(0);
  expect(sampleResponse("/v1/studio/runs?tableFilters=invalid").status).toBe(
    400,
  );
});
it("rejects all mutation verbs and never falls through to customer records", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const path of [
      "prompts/actions",
      "evals/runs",
      `runs/${sample.runs.success}/review`,
      "updates",
    ])
      expect(sampleResponse(`/v1/studio/${path}`, method).status).toBe(403);
  }
  expect(sampleResponse("/v1/studio/runs/customer-run").status).toBe(404);
  expect(sampleResponse("/v1/studio/unknown").status).toBe(404);
});
it("isolates dataset snapshots between requests", () => {
  const data = readSampleDataset();
  data.runs.length = 0;
  data.prompts.library.permissions.edit = true;
  expect(readSampleDataset().runs).toHaveLength(5);
  expect(readSampleDataset().prompts.library.permissions.edit).toBe(false);
});
