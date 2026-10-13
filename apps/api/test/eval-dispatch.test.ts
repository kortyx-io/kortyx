import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createEvalDispatcher,
  evalExecutionIdentity,
  retryAfterMs,
  waitForDispatch,
} from "../src/evals/dispatch";
import type { EvalTarget } from "../src/evals/targets";

const retryUsage = vi.hoisted(() => vi.fn());
vi.mock("@kortyx/usage-telemetry/node", () => ({
  getUsageTelemetry: () => ({ feature: retryUsage }),
}));
const target: EvalTarget = {
  id: "app",
  name: "App",
  url: "https://example.test/evals",
  serviceKey: "secret",
  organizationId: "org",
  projectId: "project",
  environment: "test",
  allowInsecureHttp: false,
};
const generation = randomUUID();
const id = randomUUID();
const headers = {
  "content-type": "application/x-ndjson",
  "x-kortyx-eval-protocol": "jobs-v1",
  "x-kortyx-eval-generation": generation,
  "x-kortyx-eval-execution-id": id,
};
const manifest = () =>
  Response.json(
    {},
    {
      headers: {
        "x-kortyx-eval-protocol": "jobs-v1",
        "x-kortyx-eval-generation": generation,
      },
    },
  );
const terminal = (sequence = 1) =>
  JSON.stringify({
    type: "error",
    sequence,
    message: "safe",
    failure: {
      version: 1,
      code: "EVAL_EXECUTION_CANCELLED",
      category: "request",
      message: "safe",
      retryable: false,
    },
  }) + "\n";
const open = (
  dispatcher: ReturnType<typeof createEvalDispatcher>,
  state = vi.fn(),
  signal = new AbortController().signal,
  cancelled = () => false,
) =>
  dispatcher.open(
    target,
    "{}",
    signal,
    id,
    new Date().toISOString(),
    state,
    cancelled,
  );
const collect = async <T>(events: AsyncIterable<T>) => {
  const result: T[] = [];
  for await (const event of events) result.push(event);
  return result;
};
describe("eval admission retry and reconnect", () => {
  it("derives stable identities per case/repetition and honors valid Retry-After formats", () => {
    expect(evalExecutionIdentity("run", "case", 1)).toBe(
      evalExecutionIdentity("run", "case", 1),
    );
    expect(evalExecutionIdentity("run", "case", 2)).not.toBe(
      evalExecutionIdentity("run", "case", 1),
    );
    expect(evalExecutionIdentity("run")).toMatch(/^[a-f0-9-]{36}$/);
    expect(retryAfterMs("2")).toBe(2000);
    expect(
      retryAfterMs(
        "Tue, 13 Oct 2026 12:00:02 GMT",
        Date.parse("2026-10-13T12:00:00Z"),
      ),
    ).toBe(2000);
    for (const value of [null, "-1", "1.5", "86401", "wrong"])
      expect(retryAfterMs(value)).toBeUndefined();
  });
  it("retries busy admission with one identity and timestamp, keeping raw body private", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(manifest())
      .mockResolvedValueOnce(
        new Response("private provider body", {
          status: 503,
          headers: { "retry-after": "0" },
        }),
      )
      .mockResolvedValueOnce(new Response(terminal(), { headers }));
    const state = vi.fn();
    const dispatcher = createEvalDispatcher(request);
    const admission = await open(dispatcher, state);
    await collect(dispatcher.events(admission));
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[1]?.[1]?.headers).toEqual(
      request.mock.calls[2]?.[1]?.headers,
    );
    expect(state).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "retrying",
        httpStatus: 503,
        retryAt: expect.any(String),
      }),
    );
    expect(JSON.stringify(state.mock.calls)).not.toContain("private");
    expect(retryUsage).toHaveBeenCalledWith("studio.eval", {
      action: "retry",
      phase: "admission",
    });
    expect(
      retryUsage.mock.calls.every(
        ([operation, properties]) =>
          operation === "studio.eval" &&
          Object.keys(properties).sort().join(",") === "action,phase",
      ),
    ).toBe(true);
  });
  it("does not replay ambiguous legacy network failures or arbitrary busy POSTs", async () => {
    for (const failed of [
      () => Promise.reject(new Error("private")),
      () =>
        Promise.resolve(
          new Response("private", {
            status: 503,
            headers: { "retry-after": "0" },
          }),
        ),
    ]) {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({}))
        .mockImplementationOnce(failed);
      await expect(open(createEvalDispatcher(request))).rejects.toMatchObject({
        code: expect.stringMatching(
          /EVAL_EXECUTION_UNKNOWN|EVAL_EXECUTOR_REJECTED/,
        ),
      });
      expect(request).toHaveBeenCalledTimes(2);
    }
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(
        Response.json(
          { accepted: false },
          { status: 503, headers: { "retry-after": "0" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(terminal(), {
          headers: { "content-type": "application/x-ndjson" },
        }),
      );
    expect(await open(createEvalDispatcher(request))).toBeDefined();
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("reconnects by cursor, skips duplicate evidence and retries a failed reconnect without a second POST", async () => {
    const first =
      JSON.stringify({
        type: "progress",
        sequence: 1,
        event: {
          type: "case-dispatch",
          caseId: "c",
          repetition: 1,
          status: "queued",
        },
      }) + "\n";
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(manifest())
      .mockResolvedValueOnce(new Response(first, { headers }))
      .mockRejectedValueOnce(new Error("lost"))
      .mockResolvedValueOnce(new Response(first + terminal(2), { headers }));
    const dispatcher = createEvalDispatcher(request, { maxRetries: 3 });
    const states = vi.fn();
    const events = await collect(
      dispatcher.events(await open(dispatcher, states)),
    );
    expect(events).toHaveLength(2);
    expect(
      request.mock.calls.filter(([, opts]) => opts?.method === "POST"),
    ).toHaveLength(1);
    expect(String(request.mock.calls[2]?.[0])).toContain("after=1");
    expect(states).toHaveBeenCalledWith(
      expect.objectContaining({ status: "reconnecting" }),
    );
  });
  it("stops on changed storage, rejected credentials and excessive retry delays", async () => {
    const restart = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(manifest())
      .mockResolvedValueOnce(new Response("", { headers }))
      .mockResolvedValueOnce(new Response("", { status: 409 }));
    const dispatcher = createEvalDispatcher(restart);
    await expect(
      collect(dispatcher.events(await open(dispatcher))),
    ).rejects.toMatchObject({ code: "EVAL_EXECUTION_UNKNOWN" });
    const unauth = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(manifest())
      .mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(open(createEvalDispatcher(unauth))).rejects.toMatchObject({
      code: "EVAL_EXECUTOR_UNAUTHORIZED",
      status: 401,
    });
    const busy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(manifest())
      .mockResolvedValueOnce(
        new Response("", { status: 503, headers: { "retry-after": "61" } }),
      );
    await expect(open(createEvalDispatcher(busy))).rejects.toMatchObject({
      code: "EVAL_RETRY_DELAY_EXCEEDED",
    });
    const exhausted = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(manifest())
      .mockResolvedValueOnce(new Response("", { status: 503 }));
    await expect(
      open(createEvalDispatcher(exhausted, { maxRetries: 0 })),
    ).rejects.toMatchObject({ code: "EVAL_EXECUTOR_BUSY" });
  });
  it("does not let a cancelled sibling interrupt shared discovery", async () => {
    let resolve!: (response: Response) => void;
    const discovery = new Promise<Response>((done) => {
      resolve = done;
    });
    const request = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(discovery)
      .mockResolvedValue(new Response(terminal(), { headers }));
    const d = createEvalDispatcher(request);
    const controller = new AbortController();
    const a = open(d, vi.fn(), controller.signal);
    const b = open(d);
    controller.abort();
    await expect(a).rejects.toBeDefined();
    resolve(manifest());
    expect(await b).toBeDefined();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("cancels accepted jobs explicitly while waiting for cleanup evidence", async () => {
    let cancelled = false;
    let completed!: (value: string) => void;
    const done = new Promise<string>((resolve) => {
      completed = resolve;
    });
    const response = new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode(await done));
          controller.close();
        },
      }),
      { headers },
    );
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(manifest())
      .mockResolvedValueOnce(response)
      .mockImplementation(async (_url, opts) => {
        expect(opts?.method).toBe("DELETE");
        completed(terminal());
        return Response.json({ cancelRequested: true });
      });
    const d = createEvalDispatcher(request);
    const admission = await open(
      d,
      vi.fn(),
      new AbortController().signal,
      () => cancelled,
    );
    cancelled = true;
    expect(await collect(d.events(admission))).toHaveLength(1);
    expect(request.mock.calls[2]?.[1]?.method).toBe("DELETE");
  });
  it("bounds discovery and validates cursors before accepting stream evidence", async () => {
    const invalid = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json(
        {},
        {
          headers: {
            "x-kortyx-eval-protocol": "jobs-v1",
            "x-kortyx-eval-generation": "private",
          },
        },
      ),
    );
    await expect(open(createEvalDispatcher(invalid))).rejects.toMatchObject({
      code: "EVAL_RESULT_INVALID",
    });
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(manifest())
      .mockResolvedValueOnce(new Response(terminal(2), { headers }));
    const d = createEvalDispatcher(request);
    await expect(collect(d.events(await open(d)))).rejects.toMatchObject({
      code: "EVAL_EXECUTION_UNKNOWN",
    });
    expect(request).toHaveBeenCalledTimes(2);
    const abort = new AbortController();
    const waited = waitForDispatch(5000, abort.signal);
    abort.abort();
    await expect(waited).rejects.toBeDefined();
    expect(() => createEvalDispatcher(fetch, { maxRetries: -1 })).toThrow();
  });
});

it("uses persisted admission generation after a worker restart and refuses changed storage before POST", async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(manifest());
  const dispatcher = createEvalDispatcher(request);
  await expect(
    dispatcher.open(
      target,
      "{}",
      new AbortController().signal,
      id,
      new Date().toISOString(),
      vi.fn(),
      () => false,
      randomUUID(),
    ),
  ).rejects.toMatchObject({ code: "EVAL_EXECUTION_UNKNOWN" });
  expect(
    request.mock.calls.every(([, options]) => options?.method !== "POST"),
  ).toBe(true);
});

it("reattaches a persisted admission directly instead of POSTing the case again", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(manifest())
    .mockResolvedValueOnce(new Response(terminal(), { headers }));
  const d = createEvalDispatcher(request);
  const a = await d.open(
    target,
    "{}",
    new AbortController().signal,
    id,
    new Date().toISOString(),
    vi.fn(),
    () => false,
    generation,
  );
  expect(await collect(d.events(a))).toHaveLength(1);
  expect(
    request.mock.calls.every(([, options]) => options?.method !== "POST"),
  ).toBe(true);
  expect(String(request.mock.calls[1]?.[0])).toContain("executionId=");
});

it("stops cancelled admission before sending another POST", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(manifest())
    .mockResolvedValueOnce(Response.json({ cancelRequested: true }));
  const d = createEvalDispatcher(request);
  await expect(
    open(d, vi.fn(), new AbortController().signal, () => true),
  ).rejects.toMatchObject({ code: "EVAL_EXECUTION_CANCELLED" });
  expect(request.mock.calls[1]?.[1]?.method).toBe("DELETE");
  expect(
    request.mock.calls.some(([, options]) => options?.method === "POST"),
  ).toBe(false);
});
it("uses the same fenced identity when recovery finds no admitted job", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(manifest())
    .mockResolvedValueOnce(new Response("", { status: 410 }))
    .mockResolvedValueOnce(new Response(terminal(), { headers }));
  const d = createEvalDispatcher(request);
  const admission = await d.open(
    target,
    "{}",
    new AbortController().signal,
    id,
    new Date().toISOString(),
    vi.fn(),
    () => false,
    generation,
  );
  expect(await collect(d.events(admission))).toHaveLength(1);
  expect(request.mock.calls[2]?.[1]?.headers).toMatchObject({
    "idempotency-key": id,
    "x-kortyx-eval-generation": generation,
  });
});
