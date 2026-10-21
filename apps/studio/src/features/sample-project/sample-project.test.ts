import {
  StudioEvalDetailSchema,
  StudioEvalLiveDetailSchema,
  StudioEvalLiveUpdateSchema,
  StudioEvalTargetsResponseSchema,
  StudioEvaluationDetailSchema,
} from "@kortyx/agent/evals";
import {
  DiagnosticContentSchema,
  DiagnosticResponseSchema,
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
import { caseRows, progressCounts } from "@/features/evals/lib/presentation";

vi.mock("server-only", () => ({}));

import { readSampleDataset } from "./data";
import { sampleBrowserResponse, sampleResponse } from "./http";

afterEach(() => vi.unstubAllGlobals());
it("serves full diagnostics and downloadable content without reaching an upstream", async () => {
  const data = readSampleDataset();
  expect(data.diagnostics).toHaveLength(7);
  const network = vi.fn(() => {
    throw new Error("Unexpected upstream access");
  });
  vi.stubGlobal("fetch", network);
  for (const diagnostic of data.diagnostics) {
    const path = `diagnostics/${diagnostic.manifest.diagnosticId}?env=sample`;
    const envelope = await sampleResponse(`/v1/studio/${path}`).json();
    expect(DiagnosticResponseSchema.parse(envelope)).toEqual(diagnostic);
    for (const prefix of ["/api/studio/", "/sample/api/studio/"]) {
      const response = await sampleBrowserResponse(
        new Request(`https://studio.test${prefix}${path}`),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-disposition")).toContain(
        diagnostic.manifest.diagnosticId,
      );
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(DiagnosticContentSchema.parse(await response.json())).toEqual(
        diagnostic.content,
      );
    }
    expect(
      sampleResponse(
        `/v1/studio/${path.replace("env=sample", "env=production")}`,
      ).status,
    ).toBe(404);
    expect(sampleResponse(`/v1/studio/${path.split("?")[0]}`).status).toBe(400);
    expect(sampleResponse(`/v1/studio/${path}`, "DELETE").status).toBe(403);
  }
  const missing =
    "/v1/studio/diagnostics/30000000-0000-4000-8000-000000000000?env=sample";
  expect(sampleResponse(missing).status).toBe(404);
  expect(
    sampleResponse("/v1/studio/diagnostics/invalid?env=sample").status,
  ).toBe(400);
  expect(network).not.toHaveBeenCalled();
});
it("links evaluation execution errors to their full diagnostic and keeps quality verdicts separate", () => {
  const data = readSampleDataset();
  let executionErrors = 0;
  for (const { run } of data.evals.runs) {
    for (const entry of run.result?.cases ?? []) {
      if (entry.status !== "error") {
        expect(entry.errors).toEqual([]);
        continue;
      }
      for (const issue of entry.errors) {
        executionErrors++;
        const diagnostic = data.diagnostics.find(
          (item) => item.manifest.diagnosticId === issue.diagnosticId,
        );
        expect(diagnostic?.manifest.correlation).toMatchObject({
          evaluationId: run.evaluationId,
          suiteRunId: run.id,
          caseId: entry.caseId,
          phase: issue.phase,
        });
        expect(
          entry.steps.some(
            (step) => step.observation.diagnosticId === issue.diagnosticId,
          ),
        ).toBe(true);
        const runtime = data.runs.find(
          (item) => item.id === diagnostic?.manifest.correlation.runId,
        );
        expect(runtime?.status).toBe("incomplete");
        expect(diagnostic?.content?.data.stack).toContain(
          "evals/read-attempt.ts",
        );
      }
    }
  }
  expect(executionErrors).toBe(1);
});
it("projects 58 root runs, 25 sessions, both specialists, and every run status", () => {
  const data = readSampleDataset();
  expect(data.runs).toHaveLength(58);
  expect(data.sessions).toHaveLength(25);
  expect(new Set(data.runs.map((run) => run.id)).size).toBe(58);
  expect(new Set(data.runs.map((run) => run.status))).toEqual(
    new Set([
      "completed",
      "failed",
      "running",
      "interrupted",
      "cancelled",
      "incomplete",
    ]),
  );
  expect(
    data.runs.find((run) => run.id === sample.runs.failure)?.result,
  ).toContain("timed out");
  expect(
    data.workflows.workflows.map((workflow) => workflow.id).sort(),
  ).toEqual(
    [sample.workflowId, ...Object.values(sample.specialistWorkflowIds)].sort(),
  );
  expect(
    data.workflows.transitions.filter(
      (transition) => transition.kind === "call",
    ),
  ).toHaveLength(2);
  expect(data.childRuns.length).toBeGreaterThan(50);
  for (const child of data.childRuns) {
    expect(data.runs.some((run) => run.id === child.parentRunId)).toBe(true);
    expect(Object.values(sample.specialistWorkflowIds)).toContain(
      child.workflowId,
    );
  }
  for (const run of data.runs) {
    expect(data.sessions.some((session) => session.id === run.sessionId)).toBe(
      true,
    );
    expect(
      data.workflows.workflows.some(
        (workflow) => workflow.id === run.workflowId,
      ),
    ).toBe(true);
    expect(run.environment).toBe("sample");
  }
});
it("keeps pending reviews alive and includes each interrupt lifecycle", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2040-01-01T00:00:00Z"));
    const data = readSampleDataset();
    expect(
      new Set(data.interrupts.map((interrupt) => interrupt.status)),
    ).toEqual(
      new Set(["pending", "resolved", "expired", "cancelled", "failed"]),
    );
    for (const id of [sample.pendingApprovalId, sample.pendingChoiceId]) {
      expect(
        data.interrupts.find((interrupt) => interrupt.id === id),
      ).toMatchObject({
        status: "pending",
        expiresAt: null,
        resolvedAt: null,
        resumeToken: null,
      });
    }
    expect(
      data.interrupts.find((interrupt) => interrupt.id === sample.interruptId),
    ).toMatchObject({
      status: "resolved",
      runId: sample.runs.approval,
      responseValue: "approve",
      resumeToken: null,
    });
    expect(
      data.interrupts.every((interrupt) => interrupt.resumeToken === null),
    ).toBe(true);
  } finally {
    vi.useRealTimers();
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
    [`evals/runs/${sample.evalRunId}/live`, StudioEvalLiveDetailSchema],
    [
      `evals/runs/${sample.evalRunId}/live?after=${"0".repeat(64)}`,
      StudioEvalLiveUpdateSchema,
    ],
    [
      `evals/runs/${sample.evalRunId}/case?caseId=${sample.caseId}&repetition=1`,
      StudioEvalDetailSchema,
    ],
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
  expect(filtered.totalCount).toBe(5);
  expect(
    filtered.runs.some((run: { id: string }) => run.id === sample.runs.failure),
  ).toBe(true);
  expect(
    (await sampleResponse("/v1/studio/runs?env=production").json()).runs,
  ).toEqual([]);
  expect(
    (await sampleResponse("/v1/studio/runs?pageSize=1&cursor=1").json()).runs,
  ).toHaveLength(1);
  expect(
    (await sampleResponse("/v1/studio/runs?range=24%20hours").json())
      .totalCount,
  ).toBe(58);
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
  expect(readSampleDataset().runs).toHaveLength(58);
  expect(readSampleDataset().prompts.library.permissions.edit).toBe(false);
});

it("records completed baseline and latest evaluations with improved results and coverage", async () => {
  const data = readSampleDataset();
  expect(data.evals.evaluations).toHaveLength(5);
  const totals = await Promise.all(
    data.evals.evaluations
      .filter(({ results }) => results.run.status !== "running")
      .map(async ({ results }) => {
        const evaluation = results.run;
        expect(evaluation.suites).toHaveLength(evaluation.suiteCount);
        expect(evaluation.completedSuites).toBe(evaluation.suiteCount);
        expect(evaluation.completedAttempts).toBe(evaluation.totalAttempts);
        const cases = evaluation.suites.flatMap((suite) => {
          expect([
            ...new Set(suite.result?.cases.map((entry) => entry.caseId)),
          ]).toEqual(
            suite.request?.caseIds ??
              suite.suite.cases.map((entry) => entry.id),
          );
          expect(suite.result?.suiteRevision).toBe(suite.suiteRevision);
          expect(suite.costs?.total.amount).toBeGreaterThan(0);
          expect(Object.keys(suite.caseCosts ?? {})).toHaveLength(
            suite.result?.cases.length ?? 0,
          );
          expect(suite.request?.promptSnapshot?.revision).toMatch(
            /^sample-prompts-[123]$/,
          );
          for (const entry of suite.result?.cases ?? []) {
            expect(
              data.sessions.some((session) => session.id === entry.sessionId),
            ).toBe(true);
            for (const step of entry.steps) {
              const run = data.runs.find(
                (run) => run.id === step.observation.runId,
              );
              expect(run?.sessionId).toBe(entry.sessionId);
              expect(step.observation.events).toBeDefined();
              expect(
                step.criteria.every(
                  (criterion) => criterion.evidence.length > 0,
                ),
              ).toBe(true);
            }
          }
          return suite.result?.cases ?? [];
        });
        expect(evaluation.counts).toEqual({
          passed: cases.filter((entry) => entry.status === "passed").length,
          failed: cases.filter((entry) => entry.status === "failed").length,
          error: cases.filter((entry) => entry.status === "error").length,
          cancelled: cases.filter((entry) => entry.status === "cancelled")
            .length,
        });
        const response = sampleResponse(
          `/v1/studio/evals/evaluations/${evaluation.id}/results`,
        );
        expect(response.status).toBe(200);
        expect((await response.json()).run.suites).toHaveLength(
          evaluation.suiteCount,
        );
        return [evaluation.suiteCount, evaluation.counts.passed, cases.length];
      }),
  );
  expect(totals).toEqual([
    [2, 3, 6],
    [3, 7, 8],
    [2, 5, 6],
    [2, 4, 4],
  ]);
  expect(data.evals.runs).toHaveLength(11);
  for (const detail of data.evals.runs) {
    expect(
      sampleResponse(`/v1/studio/evals/runs/${detail.run.id}`).status,
    ).toBe(200);
  }
});
it("keeps one evaluation partway through grading without exposing a future verdict", () => {
  const data = readSampleDataset();
  const evaluation = data.evals.evaluations.find(
    ({ results }) => results.run.id === sample.evaluationIds.candidate,
  )?.results.run;
  expect(evaluation).toMatchObject({
    status: "running",
    endedAt: null,
    suiteCount: 2,
    completedSuites: 1,
    totalAttempts: 6,
    completedAttempts: 5,
    counts: { passed: 4, failed: 1, error: 0, cancelled: 0 },
    pendingAttempts: { notStarted: 0, executing: 0, awaitingGrading: 1 },
  });
  const run = data.evals.runs.find(
    ({ run }) => run.id === sample.candidateEvalRunId,
  )?.run;
  expect(run).toBeDefined();
  if (!run) throw new Error("Missing grading sample");
  expect(run).toMatchObject({
    status: "running",
    phase: "grading",
    result: null,
    endedAt: null,
    totalAttempts: 3,
    completedAttempts: 2,
  });
  const rows = caseRows(run);
  expect(progressCounts(rows)).toMatchObject({
    total: 3,
    completed: 2,
    passed: 2,
    failed: 0,
  });
  const pending = rows.find((row) => row.caseId === "delivery-note");
  expect(pending?.status).toBe("running");
  expect(pending?.steps).toHaveLength(2);
  for (const step of pending?.steps ?? []) {
    expect(step).toMatchObject({
      status: "ungraded",
      criteria: [],
      judgeCalls: 0,
      judgeUsage: [],
    });
    expect(data.runs.some((item) => item.id === step.observation.runId)).toBe(
      true,
    );
  }
  expect(
    run.events.some(
      ({ event }) =>
        event.type === "case-completed" &&
        event.result.caseId === "delivery-note",
    ),
  ).toBe(false);
  expect(
    readSampleDataset().evals.runs.find(
      ({ run }) => run.id === sample.candidateEvalRunId,
    ),
  ).toEqual({ run });
});
it("keeps tool attempts, approvals, and replay evidence coherent", () => {
  const data = readSampleDataset();
  const events = data.detailEvents;
  const approved = events.filter(
    (event) => event.runId === sample.runs.approval,
  );
  const resolution = approved.findIndex(
    (event) => event.type === "interrupt.resolved",
  );
  const creditCalls = approved.filter(
    (event) =>
      event.type === "tool.started" && event.payload.name === "prepareCredit",
  );
  expect(creditCalls).toHaveLength(1);
  expect(
    approved.findIndex(
      (event) =>
        event.type === "tool.started" && event.payload.name === "prepareCredit",
    ),
  ).toBeGreaterThan(resolution);
  expect(approved.some((event) => event.type === "workflow.call.resumed")).toBe(
    true,
  );
  expect(
    approved.some(
      (event) =>
        event.type === "tool.reused" && event.payload.executed === false,
    ),
  ).toBe(true);
  const declinedRunIds = new Set(
    data.interrupts
      .filter((interrupt) => interrupt.responseValue === "deny")
      .map((interrupt) => interrupt.runId),
  );
  expect(
    events.filter(
      (event) =>
        declinedRunIds.has(event.runId) &&
        event.type === "tool.started" &&
        event.payload.name === "prepareCredit",
    ),
  ).toHaveLength(0);
  expect(
    events.some(
      (event) =>
        event.type === "tool.denied" && event.payload.executed === false,
    ),
  ).toBe(true);
  const retry = events.filter(
    (event) =>
      event.runId === "sample-recovered-carrier" &&
      event.type.startsWith("tool."),
  );
  expect(retry.map((event) => event.type)).toEqual([
    "tool.started",
    "tool.failed",
    "tool.started",
    "tool.completed",
  ]);
  expect(retry[0]?.payload.toolCallId).toBe(retry[2]?.payload.toolCallId);
  expect(retry[0]?.payload.attemptId).not.toBe(retry[2]?.payload.attemptId);
});
it("uses authored sample content and exposes every prompt revision without network access", async () => {
  const data = readSampleDataset();
  expect(JSON.stringify(data)).not.toMatch(
    /https?:\/\/|Bearer |@[a-z0-9.-]+\.(com|io)/i,
  );
  const declaredTools = data.workflows.workflows.flatMap((workflow) =>
    workflow.nodes.flatMap((node) => node.tools ?? []).map((tool) => tool.name),
  );
  expect(new Set(declaredTools)).toEqual(
    new Set([
      "readParcel",
      "readDeliveryNote",
      "checkReturnWindow",
      "prepareCredit",
    ]),
  );
  for (const run of data.runs) {
    expect(run.id).toMatch(/^sample-/);
    expect(run.userId).toMatch(/^sample-visitor-\d{2}$/);
    expect(run.sessionId).toMatch(/^sample-session-/);
  }
  expect(data.prompts.details).toHaveLength(3);
  for (const prompt of data.prompts.details) {
    expect(prompt.versions.map((version) => version.version)).toEqual([
      1, 2, 3,
    ]);
    expect(new Set(prompt.versions.map((version) => version.hash)).size).toBe(
      3,
    );
    expect(
      sampleResponse(`/v1/studio/prompts/assets/${prompt.asset.id}`).status,
    ).toBe(200);
    expect(
      sampleResponse(
        `/v1/studio/prompts/assets/${encodeURIComponent(prompt.asset.key)}?lookup=key`,
      ).status,
    ).toBe(200);
  }
  const children = await sampleResponse(
    "/v1/studio/runs?includeChildren=true&pageSize=100",
  ).json();
  expect(children.totalCount).toBe(data.runs.length + data.childRuns.length);
  for (const child of data.childRuns) {
    const response = sampleResponse(
      `/v1/studio/runs/${encodeURIComponent(child.id)}`,
    );
    expect(response.status).toBe(200);
    expect(
      StudioRunDetailResponseSchema.safeParse(await response.json()).success,
    ).toBe(true);
  }
});

it("offers two- and three-repetition samples with separate captured executions and mixed quality", () => {
  const data = readSampleDataset();
  const examples = data.evals.evaluations.filter(({ detail }) =>
    detail.run.name.startsWith("Consistency check"),
  );
  expect(examples.map(({ detail }) => detail.run.totalAttempts)).toEqual([
    6, 4,
  ]);
  expect(
    data.evals.evaluations.every(
      ({ results }) => results.run.suites.length >= 2,
    ),
  ).toBe(true);
  for (const { results } of examples) {
    expect(results.run.suites).toHaveLength(2);
    for (const run of results.run.suites) {
      const cases = run.result?.cases ?? [];
      expect(cases).toHaveLength(run.request?.repetitions ?? 0);
      expect(new Set(cases.map((entry) => entry.caseId)).size).toBe(1);
      expect(new Set(cases.map((entry) => entry.sessionId)).size).toBe(
        cases.length,
      );
      expect(cases.map((entry) => entry.repetition)).toEqual(
        Array.from({ length: cases.length }, (_, index) => index + 1),
      );
      for (const entry of cases)
        expect(
          run.caseCosts?.[`${entry.caseId}:${entry.repetition}`]?.total.status,
        ).toBe("complete");
    }
  }
  const mixed = examples[0].results.run.suites[0].result?.cases ?? [];
  expect(mixed.map((entry) => entry.status)).toEqual([
    "passed",
    "failed",
    "passed",
  ]);
  expect(mixed[1].steps[0].observation.text).toContain("cannot tell you");
});
