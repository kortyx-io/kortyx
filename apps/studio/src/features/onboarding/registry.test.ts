import {
  StudioDetailEventSchema,
  SAMPLE_PROJECT as sample,
} from "@kortyx/telemetry-contracts";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { StudioEvalDetailSchema } from "@kortyx/agent/evals";
import { caseRows, compareRuns } from "@/features/evals/lib/presentation";
import { buildModelExchanges } from "@/features/runs/lib/run-model-io";
import { buildTraceStory } from "@/features/runs/lib/run-trace-story";
import { readSampleDataset } from "@/features/sample-project/data";
import { sampleResponse } from "@/features/sample-project/http";
import { CHAPTERS, FULL_TOUR, resolveView } from "./registry";

it("keeps identities unique and destinations restricted to supported sample reads", async () => {
  expect(new Set(CHAPTERS.map((chapter) => chapter.id)).size).toBe(
    CHAPTERS.length,
  );
  for (const chapter of CHAPTERS) {
    expect(new Set(chapter.steps.map((step) => step.id)).size).toBe(
      chapter.steps.length,
    );
    for (const step of chapter.steps) {
      const { href, target } = resolveView(step.view);
      expect(href).toMatch(
        /^\/(runs|sessions|workflows|interrupts|prompts|evals|settings|diagnostics)(\/|$|\?)/,
      );
      expect(target).not.toContain("nth-child");
      expect(step.content.length).toBeLessThan(400);
      let api: string | undefined;
      switch (step.view.surface) {
        case "run":
          api = `runs/${sample.runs[step.view.run]}`;
          break;
        case "session":
          api = `sessions/${sample.sessions[step.view.session]}`;
          break;
        case "interrupt":
          api = `interrupts/${sample.interruptId}`;
          break;
        case "prompt":
          api = `prompts/assets/${sample.promptId}`;
          break;
        case "evaluation":
        case "eval-case":
          api = `evals/runs/${sample.evalRunId}`;
          break;
        case "eval-comparison":
          api = `evals/runs/${sample.baselineEvalRunId}`;
          break;
        case "diagnostic":
          api = `diagnostics/${sample.diagnosticIds.budgetLimit}?env=sample`;
          break;
        case "evaluation-progress":
          api = `evals/evaluations/${sample.evaluationIds.candidate}`;
          break;
        case "grading-progress":
        case "pending-eval-case":
          api = `evals/runs/${sample.candidateEvalRunId}`;
          break;
        case "workflows":
          api = "workflows";
          break;
        case "suite":
          api = "evals/targets";
          break;
      }
      if (api)
        expect(
          sampleResponse(`/v1/studio/${api}`).status,
          `${chapter.id}/${step.id}`,
        ).toBe(200);
    }
  }
});
it("conversation steps have multiple actual turns and failed model evidence is retained", () => {
  const data = readSampleDataset();
  const turns = data.runs.filter(
    (run) => run.sessionId === sample.sessions.success,
  );
  expect(turns.map((run) => run.id).sort()).toEqual(
    [sample.runs.success, sample.runs.followUp].sort(),
  );
  expect(
    data.sessions.find((session) => session.id === sample.sessions.success)
      ?.runs,
  ).toBe(2);
  const failure = buildModelExchanges(
    StudioDetailEventSchema.array().parse(
      data.detailEvents.filter((event) => event.runId === sample.runs.failure),
    ),
  );
  expect(failure).toHaveLength(1);
  expect(failure[0]?.status).toBe("failed");
  expect(failure[0]?.outputCaptured).toBe(false);
});
it("finds the orientation run independently of saved sort order and page size", async () => {
  const { href } = resolveView({ surface: "runs" });
  const query = new URL(href, "https://studio.example").searchParams;
  expect(query.get("q")).toBe(sample.runs.success);
  query.set("pageSize", "10");
  query.set("dir", "asc");
  const response = sampleResponse(`/v1/studio/runs?${query}`);
  expect(response.status).toBe(200);
  expect(
    (await response.json()).runs.map((run: { id: string }) => run.id),
  ).toEqual([sample.runs.success]);
});
it("opens the actual failed Trace operation without waiting on a background tab", () => {
  const events = StudioDetailEventSchema.array().parse(
    readSampleDataset().detailEvents.filter(
      (event) => event.runId === sample.runs.failure,
    ),
  );
  const failed = buildTraceStory(events, true).find(
    (item) => item.id === sample.traceItemIds.failure,
  );
  expect(failed?.status).toBe("failed");
  expect(failed?.inspectEvent.payload.error).toMatchObject({
    name: "ProviderTimeout",
  });
  const { href, target } = resolveView({
    surface: "run",
    run: "failure",
    focus: "trace",
  });
  const url = new URL(href, "https://studio.example");
  expect(url.pathname).toBe(`/runs/${sample.runs.failure}`);
  expect(url.searchParams.get("tab")).toBe("trace");
  expect(url.searchParams.get("trace")).toBe(failed?.id);
  expect(target).toContain('[data-detail-inspector][data-state="open"]');
  expect(target).toContain(`[data-trace-run-id="${sample.runs.failure}"]`);
  expect(target).toContain(`[data-trace-item-id="${failed?.id}"]`);
  expect(target).toContain('[data-guide-focus="trace-error"]');
});
it("the saved comparison is genuinely comparable and every execution link resolves", () => {
  const data = readSampleDataset();
  const comparison = compareRuns(
    data.evals.baseline.run,
    data.evals.detail.run,
  );
  expect(comparison).toHaveLength(3);
  expect(comparison.find((row) => row.id === sample.caseId)?.change).toBe(
    "improved",
  );
  for (const detail of [data.evals.detail, data.evals.baseline])
    for (const entry of detail.run.result?.cases ?? []) {
      expect(
        data.sessions.some((session) => session.id === entry.sessionId),
      ).toBe(true);
      for (const step of entry.steps)
        if (step.observation?.runId)
          expect(
            data.runs.some((run) => run.id === step.observation?.runId),
          ).toBe(true);
    }
});

it("registers every chapter, version and step in the bounded usage catalog", async () => {
  const { publicCatalog } = await import("@kortyx/usage-telemetry");
  for (const chapter of CHAPTERS) {
    expect(publicCatalog.properties.tour_chapter).toContain(chapter.id);
    expect(publicCatalog.properties.tour_version).toContain(
      String(chapter.version),
    );
    for (const step of chapter.steps)
      expect(publicCatalog.properties.tour_step).toContain(step.id);
  }
});

it("adds deep dives without extending the full walkthrough or relying on invented outcomes", async () => {
  expect(FULL_TOUR).toHaveLength(6);
  expect(
    CHAPTERS.filter((chapter) => chapter.fullTour).reduce(
      (total, chapter) => total + chapter.steps.length,
      0,
    ),
  ).toBe(21);
  expect(FULL_TOUR).not.toContain("error-diagnostics");
  expect(FULL_TOUR).not.toContain("evaluation-progress");
  const parent = await sampleResponse(
    `/v1/studio/evals/evaluations/${sample.evaluationIds.candidate}`,
  ).json();
  expect(parent.run.status).toBe("running");
  expect(parent.run.completedAttempts).toBe(5);
  const detail = await sampleResponse(
    `/v1/studio/evals/runs/${sample.candidateEvalRunId}`,
  ).json();
  expect(detail.run.phase).toBe("grading");
  expect(detail.run.result).toBeNull();
  const pending = caseRows(StudioEvalDetailSchema.parse(detail).run).find(
    (entry) => entry.caseId === sample.gradingCaseId,
  );
  expect(pending?.status).toBe("running");
  expect(pending?.steps).toHaveLength(2);
  for (const step of pending?.steps ?? []) expect(step.criteria).toEqual([]);
  const diagnostic = await sampleResponse(
    `/v1/studio/diagnostics/${sample.diagnosticIds.budgetLimit}?env=sample`,
  ).json();
  expect(diagnostic.state).toBe("available");
  expect(diagnostic.content.capture.status).toBe("complete");
  expect(JSON.stringify(diagnostic.content)).toContain("ToolBudgetExceeded");
});
