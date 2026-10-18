import {
  StudioDetailEventSchema,
  SAMPLE_PROJECT as sample,
} from "@kortyx/telemetry-contracts";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { compareRuns } from "@/features/evals/lib/presentation";
import { buildModelExchanges } from "@/features/runs/lib/run-model-io";
import { readSampleDataset } from "@/features/sample-project/data";
import { sampleResponse } from "@/features/sample-project/http";
import { CHAPTERS, resolveView } from "./registry";

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
        /^\/(runs|sessions|workflows|interrupts|prompts|evals|settings)(\/|$|\?)/,
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
