import type { EvalGradeInput, EvalJudge } from "@kortyx/agent";
import {
  TelemetryAuthError,
  type TelemetryDb,
  TelemetryForbiddenError,
} from "@kortyx/telemetry-db";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApiApp } from "../src/app";
import { loadStudioEvalJudge } from "../src/evals/judge";

const auth = vi.hoisted(() => ({
  authenticate: vi.fn(),
  environment: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("@kortyx/telemetry-db", async (original) => ({
  ...(await original<typeof import("@kortyx/telemetry-db")>()),
  authenticateTelemetryApiKey: auth.authenticate,
  ensureProjectEnvironmentAllowed: auth.environment,
  enqueueEvalRun: auth.enqueue,
}));
const identity = {
  id: "studio/test",
  version: "1",
  location: "studio" as const,
};
const verdict = {
  passed: true,
  reason: "Supported by retrieved data.",
  evidence: ["Paris"],
};
const body = {
  environment: "development",
  judge: identity,
  criterion: { id: "city", text: "Correct city" },
  input: { message: "Which city?" },
  observation: {
    type: "answer",
    text: "Paris",
    structured: [],
    events: [{ type: "tool-call-result", content: "Paris" }],
  },
  conversation: [],
};
const grade = vi.fn((_input: EvalGradeInput) => Promise.resolve(verdict));
const judge: EvalJudge = { ...identity, grade };
const app = (evalJudge: EvalJudge | undefined = judge) =>
  createApiApp({
    db: {} as TelemetryDb,
    apiKeyPepper: "test",
    ...(evalJudge ? { evalJudge } : {}),
  });
const request = (api = app(), value: unknown = body, key = "execute") =>
  api.request("/v1/studio/evals/judge", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(value),
  });

beforeEach(() => {
  vi.clearAllMocks();
  grade.mockImplementation(async () => verdict);
  auth.enqueue.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
  });
  auth.authenticate.mockImplementation(async (_db, { apiKey }) => {
    if (!["execute", "read"].includes(apiKey)) throw new TelemetryAuthError();
    return {
      keyId: "key",
      organizationId: "org",
      projectId: "project",
      scopes: apiKey === "read" ? ["studio:read"] : ["studio:read", "eval:run"],
    };
  });
  auth.environment.mockImplementation(async (_db, { environment }) => {
    if (environment !== "development")
      throw new TelemetryForbiddenError("Environment denied.");
  });
});
afterEach(() => vi.unstubAllGlobals());

it("requires authenticated eval permission and an allowed project environment", async () => {
  const api = app();
  expect(
    (await api.request("/v1/studio/evals/judge?environment=development"))
      .status,
  ).toBe(401);
  expect((await request(api, body, "invalid")).status).toBe(401);
  expect((await request(api, body, "read")).status).toBe(403);
  expect(
    (await request(api, { ...body, environment: "production" })).status,
  ).toBe(403);
  expect(grade).not.toHaveBeenCalled();
  const response = await api.request(
    "/v1/studio/evals/judge?environment=development",
    { headers: { authorization: "Bearer execute" } },
  );
  expect(await response.json()).toEqual(identity);
  expect(auth.environment).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      organizationId: "org",
      projectId: "project",
      environment: "development",
    }),
  );
});

it("grades execution evidence and returns a validated verdict and judge identity", async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ judge: identity, verdict });
  expect(grade).toHaveBeenCalledWith(
    expect.objectContaining({
      criterion: body.criterion,
      observation: body.observation,
      signal: expect.any(AbortSignal),
    }),
  );
});

it("does not invoke a judge for malformed, oversized or stale requests", async () => {
  const api = app();
  expect((await request(api, { ...body, unexpected: "field" })).status).toBe(
    400,
  );
  expect(
    (await request(api, { ...body, judge: { ...identity, version: "old" } }))
      .status,
  ).toBe(409);
  expect(
    (
      await request(api, {
        ...body,
        observation: { ...body.observation, text: "x".repeat(2_000_000) },
      })
    ).status,
  ).toBe(413);
  expect(grade).not.toHaveBeenCalled();
});

it("does not impose the small run-control body limit on captured judge evidence", async () => {
  const response = await request(app(), {
    ...body,
    observation: { ...body.observation, text: "x".repeat(20_000) },
  });
  expect(response.status).toBe(200);
});

it("reports disabled judging and provider failures without exposing secrets", async () => {
  const disabled = createApiApp({
    db: {} as TelemetryDb,
    apiKeyPepper: "test",
  });
  expect((await request(disabled)).status).toBe(503);
  grade.mockRejectedValueOnce(new Error("PRIVATE_PROVIDER_KEY"));
  const response = await request();
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("PRIVATE_PROVIDER_KEY");
  grade.mockResolvedValueOnce({ ...verdict, passed: "invalid" } as never);
  expect((await request()).status).toBe(502);
});

it("bounds concurrent provider calls and releases capacity after completion", async () => {
  const api = app();
  let finish: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  grade.mockImplementation(async () => {
    await waiting;
    return verdict;
  });
  const calls = Array.from({ length: 4 }, () => request(api));
  await vi.waitFor(() => expect(grade).toHaveBeenCalledTimes(4));
  expect((await request(api)).status).toBe(429);
  finish?.();
  expect(
    (await Promise.all(calls)).every((response) => response.status === 200),
  ).toBe(true);
  expect((await request(api)).status).toBe(200);
});

it("loads the optional server judge without leaking its provider credentials", () => {
  expect(loadStudioEvalJudge({})).toBeUndefined();
  expect(() =>
    loadStudioEvalJudge({ KORTYX_EVAL_JUDGE_MODEL: "test" }),
  ).toThrow("API_KEY");
  const loaded = loadStudioEvalJudge({
    KORTYX_EVAL_JUDGE_MODEL: "test",
    KORTYX_EVAL_JUDGE_API_KEY: "PRIVATE_PROVIDER_KEY",
  });
  expect(loaded).toMatchObject({
    id: "studio/openai/test",
    location: "studio",
  });
  expect(JSON.stringify(loaded)).not.toContain("PRIVATE_PROVIDER_KEY");
  expect(() =>
    loadStudioEvalJudge({
      KORTYX_EVAL_JUDGE_MODEL: "test",
      KORTYX_EVAL_JUDGE_API_KEY: "PRIVATE_PROVIDER_KEY",
      KORTYX_EVAL_JUDGE_API: "unsupported",
    }),
  ).toThrow("responses or chat-completions");
});

it("uses an OpenRouter-compatible chat endpoint and validates its structured verdict", async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      id: "synthetic-openrouter-response",
      object: "chat.completion",
      system_fingerprint: null,
      created: 0,
      model: "openai/gpt-4o",
      usage: {
        prompt_tokens: 20,
        completion_tokens: 10,
        total_tokens: 30,
        cost: 0.001,
      },
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify(verdict) },
          finish_reason: "stop",
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const loaded = loadStudioEvalJudge({
    KORTYX_EVAL_JUDGE_MODEL: "openai/gpt-4o",
    KORTYX_EVAL_JUDGE_API_KEY: "PRIVATE_OPENROUTER_KEY",
    KORTYX_EVAL_JUDGE_BASE_URL: "https://openrouter.ai/api/v1",
    KORTYX_EVAL_JUDGE_API: "chat-completions",
    KORTYX_EVAL_JUDGE_ID: "studio/openrouter/openai/gpt-4o",
  });
  expect(
    await loaded?.grade({
      criterion: body.criterion,
      input: body.input,
      observation: { ...body.observation, type: "answer" },
      conversation: [],
      signal: new AbortController().signal,
    }),
  ).toEqual(verdict);
  expect(fetch).toHaveBeenCalledOnce();
  const [input, init] = fetch.mock.calls[0] as unknown as [
    Request | string,
    RequestInit,
  ];
  const sent = input instanceof Request ? input : new Request(input, init);
  expect(sent.url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(JSON.parse(await sent.text())).toMatchObject({
    model: "openai/gpt-4o",
    stream: false,
    response_format: {
      type: "json_schema",
      json_schema: { name: "eval_verdict" },
    },
  });
  expect(JSON.stringify(loaded)).not.toContain("PRIVATE_OPENROUTER_KEY");
});

it("defaults to the Studio judge despite an available code judge and pins selection in the stored request", async () => {
  const { getEvalSuiteRevision } = await import("@kortyx/agent");
  const suite = {
    id: "jobs",
    cases: [
      {
        id: "salary",
        steps: [
          {
            message: "Salary?",
            expect: { type: "answer" as const, criteria: ["Correct salary"] },
          },
        ],
      },
    ],
  };
  const codeJudge = { id: "app/test", version: "3", location: "app" as const };
  const target = {
    id: "target",
    name: "App",
    organizationId: "org",
    projectId: "project",
    environment: "development",
    url: "https://app.test/evals",
    serviceKey: "consumer-service-key-at-least-32-characters",
    allowInsecureHttp: false,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        schemaVersion: 1,
        studioJudging: true,
        suites: [suite],
        responders: [],
        references: [],
        judge: codeJudge,
      }),
    ),
  );
  const create = (configured: boolean) =>
    createApiApp({
      db: {} as TelemetryDb,
      apiKeyPepper: "test",
      evalTargets: [target],
      ...(configured ? { evalJudge: judge } : {}),
    });
  const start = (api: ReturnType<typeof createApiApp>, selection?: string) =>
    api.request("/v1/studio/evals/runs", {
      method: "POST",
      headers: {
        authorization: "Bearer execute",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        targetId: target.id,
        suiteId: suite.id,
        suiteRevision: getEvalSuiteRevision(suite),
        ...(selection ? { judge: selection } : {}),
      }),
    });
  expect((await start(create(true))).status).toBe(202);
  expect(auth.enqueue).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      request: expect.objectContaining({ grading: "studio", judge: identity }),
    }),
  );
  expect(grade).not.toHaveBeenCalled();
  expect((await start(create(true), "app")).status).toBe(202);
  expect(auth.enqueue).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      request: expect.objectContaining({ grading: "app", judge: codeJudge }),
    }),
  );
  auth.enqueue.mockClear();
  const missing = await start(create(false));
  expect(missing.status).toBe(503);
  expect(await missing.json()).toMatchObject({
    error: expect.stringContaining("Studio judge is not configured"),
  });
  expect(auth.enqueue).not.toHaveBeenCalled();
  const discovery = await create(true).request("/v1/studio/evals/targets", {
    headers: { authorization: "Bearer execute" },
  });
  expect(await discovery.json()).toMatchObject({ studioJudge: identity });
  expect(
    JSON.stringify(
      await (
        await create(false).request("/v1/studio/evals/targets", {
          headers: { authorization: "Bearer execute" },
        })
      ).json(),
    ),
  ).not.toContain(target.serviceKey);
});

it("does not enqueue an absent App judge or an unsupported Studio capture protocol", async () => {
  const { getEvalSuiteRevision } = await import("@kortyx/agent");
  const suite = {
    id: "jobs",
    cases: [
      {
        id: "one",
        steps: [{ message: "Hi", expect: { type: "answer" as const } }],
      },
    ],
  };
  const target = {
    id: "target",
    name: "App",
    organizationId: "org",
    projectId: "project",
    environment: "development",
    url: "https://app.test/evals",
    serviceKey: "consumer-service-key-at-least-32-characters",
    allowInsecureHttp: false,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        schemaVersion: 1,
        suites: [suite],
        responders: [],
        references: [],
      }),
    ),
  );
  const api = createApiApp({
    db: {} as TelemetryDb,
    apiKeyPepper: "test",
    evalTargets: [target],
    evalJudge: judge,
  });
  for (const [selection, status] of [
    ["studio", 409],
    ["app", 503],
    ["invalid", 400],
  ] as const) {
    const response = await api.request("/v1/studio/evals/runs", {
      method: "POST",
      headers: {
        authorization: "Bearer execute",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        targetId: target.id,
        suiteId: suite.id,
        suiteRevision: getEvalSuiteRevision(suite),
        judge: selection,
      }),
    });
    expect(response.status).toBe(status);
  }
  expect(auth.enqueue).not.toHaveBeenCalled();
});
