import { afterEach, expect, it, vi } from "vitest";
import {
  createEvals,
  createStudioEvalJudge,
  type EvalGradeInput,
  type EvalSuite,
} from "../src/evals/index";

afterEach(() => vi.unstubAllGlobals());
const identity = {
  id: "studio/openai/test",
  version: "rubric-1",
  location: "studio" as const,
};
const options = {
  url: "http://127.0.0.1:7440",
  apiKey: "PRIVATE_STUDIO_KEY",
  environment: "development",
  allowInsecureHttp: true,
};
const observation = {
  type: "answer" as const,
  text: "Paris: EUR 90,000",
  structured: [],
  events: [
    {
      type: "tool-call-result",
      tool: "read_job",
      toolCallId: "read-1",
      content: "Paris: EUR 90,000",
    },
  ],
};
const suite: EvalSuite = {
  id: "jobs",
  cases: [
    {
      id: "paris",
      steps: [
        {
          message: "Salary?",
          expect: { type: "answer", criteria: ["Matches retrieved salary"] },
        },
      ],
    },
  ],
};
const input = (): EvalGradeInput => ({
  criterion: { id: "salary", text: "Matches retrieved salary" },
  input: { message: "Salary?" },
  observation,
  conversation: [],
  signal: new AbortController().signal,
});
const verdict = {
  passed: true,
  reason: "Matches the tool result.",
  evidence: ["Paris: EUR 90,000"],
};

it("uses a pinned Studio judge through the ordinary runner and stores its actual identity", async () => {
  const request = vi.fn(async (_url: unknown, init?: RequestInit) =>
    Response.json(
      init?.method === "POST" ? { judge: identity, verdict } : identity,
    ),
  );
  vi.stubGlobal("fetch", request);
  const judge = await createStudioEvalJudge(options);
  const result = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
    execute: () => ({ observation }),
    judge,
  }).run({ suiteId: suite.id });
  expect(result.status).toBe("passed");
  expect(result.judge).toEqual(identity);
  expect(request).toHaveBeenCalledTimes(2);
  expect(String(request.mock.calls[0]?.[0])).toBe(
    "http://127.0.0.1:7440/v1/studio/evals/judge?environment=development",
  );
  const grade = request.mock.calls[1]?.[1];
  expect(grade?.headers).toMatchObject({
    authorization: "Bearer PRIVATE_STUDIO_KEY",
  });
  expect(grade?.redirect).toBe("error");
  expect(JSON.parse(String(grade?.body))).toMatchObject({
    judge: identity,
    environment: "development",
    observation,
  });
  expect(JSON.stringify(result)).not.toContain(options.apiKey);
});

it.each([
  "unavailable",
  "changed",
  "malformed",
])("records %s Studio grading as an error without a fallback judge", async (failure) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method !== "POST") return Response.json(identity);
      if (failure === "unavailable")
        return Response.json(
          { error: "PRIVATE_PROVIDER_ERROR" },
          { status: 502 },
        );
      if (failure === "changed")
        return Response.json({
          judge: { ...identity, version: "new" },
          verdict,
        });
      return Response.json({
        judge: identity,
        verdict: { ...verdict, passed: "yes" },
      });
    }),
  );
  const result = await createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
    execute: () => ({ observation }),
    judge: await createStudioEvalJudge(options),
  }).run({ suiteId: suite.id });
  expect(result.status).toBe("error");
  expect(result.cases[0]?.errors[0]?.phase).toBe("grading");
  expect(result.cases[0]?.steps[0]?.criteria).toEqual([]);
  expect(JSON.stringify(result)).not.toMatch(
    /PRIVATE_PROVIDER_ERROR|PRIVATE_STUDIO_KEY/,
  );
});

it("honors cancellation before sending any grading request", async () => {
  const request = vi.fn(async () => Response.json(identity));
  vi.stubGlobal("fetch", request);
  const judge = await createStudioEvalJudge(options);
  await expect(
    judge.grade({ ...input(), signal: AbortSignal.abort() }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(request).toHaveBeenCalledOnce();
});

it("forwards hosted billing only after validating the pinned identity, with or without a usage observer", async () => {
  const usage = [
    {
      provider: "openrouter",
      model: "test/model",
      occurredAt: new Date().toISOString(),
      pricing: { source: "provider", currency: "USD", actualCostMicros: 350 },
    },
  ];
  let changed = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) =>
      Response.json(
        init?.method === "POST"
          ? {
              judge: changed ? { ...identity, version: "changed" } : identity,
              verdict,
              usage,
            }
          : identity,
      ),
    ),
  );
  const judge = await createStudioEvalJudge(options);
  const onUsage = vi.fn();
  expect(await judge.grade({ ...input(), onUsage })).toEqual(verdict);
  expect(onUsage).toHaveBeenCalledExactlyOnceWith(usage[0]);
  expect(await judge.grade(input())).toEqual(verdict);
  changed = true;
  onUsage.mockClear();
  await expect(judge.grade({ ...input(), onUsage })).rejects.toThrow(
    "identity changed",
  );
  expect(onUsage).not.toHaveBeenCalled();
});

it("cancels a stalled grading body when the case is aborted", async () => {
  let cancelled = false;
  const request = vi.fn(async (_url: unknown, init?: RequestInit) =>
    init?.method === "POST"
      ? new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
        )
      : Response.json(identity),
  );
  vi.stubGlobal("fetch", request);
  const judge = await createStudioEvalJudge(options);
  const controller = new AbortController();
  const pending = judge.grade({ ...input(), signal: controller.signal });
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(cancelled).toBe(true);
});

it.each([
  { url: "http://example.com", allowInsecureHttp: false },
  { url: "https://user:password@example.com" },
  { url: "https://example.com/path" },
  { url: "https://example.com?token=secret" },
  { url: "https://example.com#fragment" },
  { apiKey: "" },
])("rejects unsafe or incomplete configuration before discovery: %j", async (override) => {
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  await expect(
    createStudioEvalJudge({ ...options, ...override }),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});

it.each([
  "id",
  "version",
  "location",
])("rejects a changed judge %s after discovery, preserving the original pin", async (field) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) =>
      Response.json(
        init?.method === "POST"
          ? {
              judge: {
                ...identity,
                [field]: field === "location" ? "app" : "changed",
              },
              verdict,
            }
          : identity,
      ),
    ),
  );
  const judge = await createStudioEvalJudge({
    ...options,
    signal: new AbortController().signal,
  });
  await expect(judge.grade(input())).rejects.toThrow("identity changed");
});

it("rejects discovery of an app judge and missing environment without sending grading", async () => {
  const request = vi.fn(async () =>
    Response.json({ ...identity, location: "app" }),
  );
  vi.stubGlobal("fetch", request);
  await expect(createStudioEvalJudge(options)).rejects.toThrow(
    "did not provide a Studio judge",
  );
  await expect(
    createStudioEvalJudge({ ...options, environment: " " }),
  ).rejects.toThrow("requires an API origin");
  expect(request).toHaveBeenCalledOnce();
});

it.each([
  "missing",
  "locked",
  "oversized",
])("bounds and cancels a %s discovery response instead of trusting provider data", async (failure) => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (failure === "oversized")
        controller.enqueue(new Uint8Array(1_000_001));
    },
    cancel() {
      cancelled = true;
      throw new Error("PRIVATE_CANCEL_ERROR");
    },
  });
  const response =
    failure === "missing"
      ? new Response(null)
      : new Response(body, { status: failure === "locked" ? 503 : 200 });
  const lock = failure === "locked" ? body.getReader() : undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
  await expect(createStudioEvalJudge(options)).rejects.toThrow(
    failure === "oversized" ? "too large" : "unavailable",
  );
  if (failure === "oversized") expect(cancelled).toBe(true);
  lock?.releaseLock();
});

it("discards body cancellation errors while aborting a stalled judge", async () => {
  const request = vi.fn(async (_url: unknown, init?: RequestInit) =>
    init?.method === "POST"
      ? new Response(
          new ReadableStream({
            cancel() {
              throw new Error("PRIVATE_CANCEL_ERROR");
            },
          }),
        )
      : Response.json(identity),
  );
  vi.stubGlobal("fetch", request);
  const judge = await createStudioEvalJudge(options);
  const controller = new AbortController();
  const pending = judge.grade({ ...input(), signal: controller.signal });
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

it("compacts direct HTTP judging and removes nested snapshots from previous steps", async () => {
  const request = vi.fn(async (_url: unknown, init?: RequestInit) =>
    Response.json(
      init?.method === "POST" ? { judge: identity, verdict } : identity,
    ),
  );
  vi.stubGlobal("fetch", request);
  const judge = await createStudioEvalJudge(options);
  const noisy = {
    ...observation,
    events: [
      ...observation.events,
      { type: "structured-data", kind: "text-delta", delta: "NOISE" },
    ],
  };
  await judge.grade({
    ...input(),
    observation: noisy,
    conversation: [
      {
        index: 0,
        input: { message: "Earlier salary?" },
        expectation: { type: "answer" },
        observation: noisy,
        status: "passed",
        criteria: [],
        evidence: { version: "compact-v1", history: true, observation: noisy },
      },
    ],
  });
  const payload = JSON.parse(String(request.mock.calls[1]?.[1]?.body));
  expect(payload.observation).toEqual(observation);
  expect(payload.conversation[0].observation).toEqual(observation);
  expect(payload.conversation[0]).not.toHaveProperty("evidence");
  expect(JSON.stringify(payload)).not.toContain("NOISE");
});
