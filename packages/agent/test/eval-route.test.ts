import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createEvalRouteHandler,
  type EvalRunOptions,
  type EvalRunResult,
  type EvalSuite,
  getEvalSuiteRevision,
} from "../src/evals/index";

const suite: EvalSuite = {
  id: "jobs",
  cases: [
    { id: "one", steps: [{ message: "hi", expect: { type: "answer" } }] },
  ],
};
const key = "test-service-key-with-at-least-32-characters";
const manifest = {
  schemaVersion: 1 as const,
  suites: [suite],
  responders: [],
  references: [],
};
const result = (): EvalRunResult => ({
  id: randomUUID(),
  suiteId: suite.id,
  suiteRevision: getEvalSuiteRevision(suite),
  suite,
  startedAt: new Date().toISOString(),
  durationMs: 1,
  status: "passed",
  counts: { passed: 1, failed: 0, error: 0, cancelled: 0 },
  cases: [],
  errors: [],
});
const request = (body = {}, authorization = `Bearer ${key}`) =>
  new Request("http://localhost/evals", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({
      suiteId: suite.id,
      suiteRevision: getEvalSuiteRevision(suite),
      ...body,
    }),
  });
describe("consumer eval transport", () => {
  it("validates transport configuration and rejects malformed requests before execution", async () => {
    const run = vi.fn();
    const evals = { describe: () => manifest, run };
    expect(() =>
      createEvalRouteHandler({ evals, serviceKey: "short" }),
    ).toThrow("32 characters");
    for (const limits of [
      { maxCases: 0 },
      { maxCases: 1.5 },
      { maxActiveRuns: 0 },
      { maxActiveRuns: NaN },
    ])
      expect(() =>
        createEvalRouteHandler({ evals, serviceKey: key, ...limits }),
      ).toThrow("positive integers");
    const handler = createEvalRouteHandler({ evals, serviceKey: key });
    expect((await handler(new Request("http://localhost/evals"))).status).toBe(
      401,
    );
    expect(
      (
        await handler(
          new Request("http://localhost/evals", {
            method: "DELETE",
            headers: { authorization: `Bearer ${key}` },
          }),
        )
      ).status,
    ).toBe(405);
    for (const contentType of [undefined, "text/plain"])
      expect(
        (
          await handler(
            new Request("http://localhost/evals", {
              method: "POST",
              headers: {
                authorization: `Bearer ${key}`,
                ...(contentType ? { "content-type": contentType } : {}),
              },
            }),
          )
        ).status,
      ).toBe(415);
    for (const body of ["not JSON", JSON.stringify({ suiteId: suite.id })])
      expect(
        (
          await handler(
            new Request("http://localhost/evals", {
              method: "POST",
              headers: {
                authorization: `Bearer ${key}`,
                "content-type": "application/json",
              },
              body,
            }),
          )
        ).status,
      ).toBe(400);
    expect(
      (
        await handler(
          new Request("http://localhost/evals", {
            method: "POST",
            headers: {
              authorization: `Bearer ${key}`,
              "content-type": "application/json",
            },
            body: " ".repeat(16385),
          }),
        )
      ).status,
    ).toBe(413);
    expect((await handler(request({ suiteId: "missing" }))).status).toBe(400);
    expect(
      (await handler(new Request(request(), { signal: AbortSignal.abort() })))
        .status,
    ).toBe(409);
    expect(run).not.toHaveBeenCalled();
  });

  it("requires authorization before exposing a manifest or invoking the runner", async () => {
    const run = vi.fn();
    const handler = createEvalRouteHandler({
      serviceKey: key,
      evals: { describe: () => manifest, run },
    });
    expect((await handler(request({}, "Bearer wrong"))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
    expect(
      (
        await handler(
          new Request("http://localhost/evals", {
            headers: { authorization: `Bearer ${key}` },
          }),
        )
      ).status,
    ).toBe(200);
  });
  it("rejects stale suites, unknown selections and too many repetitions before execution", async () => {
    const run = vi.fn();
    const handler = createEvalRouteHandler({
      serviceKey: key,
      maxCases: 1,
      evals: { describe: () => manifest, run },
    });
    expect(
      (await handler(request({ suiteRevision: "0".repeat(64) }))).status,
    ).toBe(409);
    expect((await handler(request({ caseIds: ["missing"] }))).status).toBe(400);
    expect((await handler(request({ caseIds: ["one", "one"] }))).status).toBe(
      400,
    );
    expect((await handler(request({ repetitions: 2 }))).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });
  it("streams progress and the final result without leaking a runner exception", async () => {
    const handler = createEvalRouteHandler({
      serviceKey: key,
      evals: {
        describe: () => manifest,
        run: async (options) => {
          await options.onProgress?.({
            type: "case-started",
            caseId: "one",
            repetition: 1,
            sessionId: "eval-session",
          });
          return result();
        },
      },
    });
    const wire = (await (await handler(request({ caseIds: ["one"] }))).text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(wire.map((event) => event.type)).toEqual(["progress", "result"]);
    const failed = createEvalRouteHandler({
      serviceKey: key,
      evals: {
        describe: () => manifest,
        run: async () => {
          throw new Error("PRIVATE-TOKEN");
        },
      },
    });
    expect(await (await failed(request())).text()).not.toContain(
      "PRIVATE-TOKEN",
    );
  });
  it("enforces active-run limits and signals cleanup when the stream reader disconnects", async () => {
    let signal: AbortSignal | undefined;
    let settled = false;
    const handler = createEvalRouteHandler({
      serviceKey: key,
      evals: {
        describe: () => manifest,
        run: async (options: EvalRunOptions) => {
          signal = options.signal;
          await new Promise<void>((resolve) =>
            signal?.addEventListener("abort", () => resolve(), { once: true }),
          );
          settled = true;
          return result();
        },
      },
    });
    const first = await handler(request());
    expect((await handler(request())).status).toBe(429);
    await first.body!.cancel();
    await vi.waitFor(() => expect(settled).toBe(true));
    expect(signal!.aborted).toBe(true);
  });
});
