import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@studio/auth", () => ({ studioAuth: { authorize: vi.fn() } }));
vi.mock("./server", () => ({
  readEvaluationDetail: vi.fn(),
  readEvaluationHistory: vi.fn(),
  readEvaluationComparison: vi.fn(),
}));

import { studioAuth } from "@studio/auth";
import { sampleEvaluationComparison } from "@/features/sample-project/comparison";
import { readSampleDataset } from "@/features/sample-project/data";
import { readModalComparison } from "./modal-comparison";
import {
  readEvaluationComparison,
  readEvaluationDetail,
  readEvaluationHistory,
} from "./server";

const req = (baseline: string = sample.evaluationIds.baseline) =>
  new Request(
    `http://localhost/api/studio/evals/comparison?run=${sample.evaluationId}&baseline=${baseline}`,
  );
beforeEach(() => {
  vi.resetAllMocks();
});
it("authorizes before reading and rejects invalid IDs", async () => {
  vi.mocked(studioAuth.authorize).mockResolvedValueOnce(
    new Response(null, { status: 401 }),
  );
  expect((await readModalComparison(req())).status).toBe(401);
  expect(
    (
      await readModalComparison(
        new Request("http://localhost/api/studio/evals/comparison?run=invalid"),
      )
    ).status,
  ).toBe(400);
  expect(readEvaluationDetail).not.toHaveBeenCalled();
});
it("forwards request scope to every read and returns summaries without transcripts", async () => {
  const history = readSampleDataset().evals.evaluations.map(
    ({ results }) => results.run,
  );
  const run = history.find((run) => run.id === sample.evaluationId);
  if (!run) throw new Error("Missing fixture");
  vi.mocked(readEvaluationDetail).mockResolvedValue({ run });
  vi.mocked(readEvaluationHistory).mockResolvedValue({ runs: history });
  vi.mocked(readEvaluationComparison).mockImplementation(async (id) => {
    const run = history.find((run) => run.id === id);
    if (!run) throw new Error("Not found");
    return { run: sampleEvaluationComparison(run) };
  });
  const request = req();
  const response = await readModalComparison(request);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const json = await response.json();
  expect(json.earlier.id).toBe(sample.evaluationIds.baseline);
  expect(json.rows[0].current).toHaveProperty("costs");
  expect(JSON.stringify(json)).not.toMatch(
    /observation|sessionId|promptSnapshot/,
  );
  expect(readEvaluationDetail).toHaveBeenCalledWith(
    sample.evaluationId,
    request,
  );
  expect(readEvaluationHistory).toHaveBeenCalledWith(request);
  expect(readEvaluationComparison).toHaveBeenCalledWith(
    sample.evaluationId,
    request,
  );
  expect(readEvaluationComparison).toHaveBeenCalledWith(
    sample.evaluationIds.baseline,
    request,
  );
  vi.mocked(readEvaluationComparison).mockClear();
  const invalid = await readModalComparison(
    req(sample.evaluationIds.candidate),
  );
  expect((await invalid.json()).state).toBe("error");
  expect(readEvaluationComparison).not.toHaveBeenCalled();
});
it("returns a recoverable safe error instead of exposing upstream details", async () => {
  vi.mocked(readEvaluationDetail).mockRejectedValue(new Error("secret"));
  const response = await readModalComparison(req());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret");
});
