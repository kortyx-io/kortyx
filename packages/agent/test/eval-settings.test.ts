import { describe, expect, it, vi } from "vitest";
import { createEvals } from "../src/evals/create-evals";
import { createEvalIssue } from "../src/evals/errors";
import {
  EvalSettingsSchema,
  ResolvedEvalSettingsSchema,
  resolveEvalSettings,
} from "../src/evals/settings";

const execution = {
  defaults: { concurrency: 2, caseTimeoutMs: 120_000 },
  limits: { concurrency: 4, caseTimeoutMs: 300_000 },
  overrides: ["concurrency", "repetitions", "caseTimeoutMs"] as (
    | "concurrency"
    | "repetitions"
    | "caseTimeoutMs"
  )[],
};
describe("evaluation settings precedence", () => {
  it("resolves each field independently, skipping undefined without persisting fallbacks", () => {
    expect(
      resolveEvalSettings(
        { concurrency: 3, caseTimeoutMs: undefined },
        { repetitions: 2 },
        execution,
      ),
    ).toEqual({
      values: {
        repetitions: 2,
        concurrency: 3,
        caseTimeoutMs: 120_000,
        gradingTimeoutMs: 60_000,
        runTimeoutMs: 1_800_000,
        judge: "studio",
      },
      sources: {
        repetitions: "studio",
        concurrency: "run",
        caseTimeoutMs: "sdk",
        gradingTimeoutMs: "sdk-default",
        runTimeoutMs: "studio-default",
        judge: "studio-default",
      },
    });
    expect(resolveEvalSettings({}, {}, undefined).values.caseTimeoutMs).toBe(
      60_000,
    );
    expect(
      resolveEvalSettings({}, {}, execution, { runTimeoutMs: 3_600_000 }).values
        .runTimeoutMs,
    ).toBe(3_600_000);
  });
  it("rejects ceilings instead of silently clamping an override", () => {
    expect(() =>
      resolveEvalSettings({ concurrency: 5 }, {}, execution),
    ).toThrow("application maximum");
    expect(() =>
      resolveEvalSettings({ caseTimeoutMs: 300_001 }, {}, execution),
    ).toThrow("application maximum");
    expect(() =>
      resolveEvalSettings(
        { runTimeoutMs: 3_600_001 },
        {},
        execution,
        {},
        3_600_000,
      ),
    ).toThrow("administrator maximum");
    expect(() => resolveEvalSettings({ caseTimeoutMs: 1000 })).toThrow(
      "Update the consumer SDK",
    );
  });
  it.each([
    0,
    -1,
    0.5,
    NaN,
    Infinity,
    2_147_483_648,
  ])("rejects invalid timer %s rather than scheduling a one-millisecond timer", (value) => {
    expect(EvalSettingsSchema.safeParse({ runTimeoutMs: value }).success).toBe(
      false,
    );
  });
});
const suite = {
  id: "settings",
  cases: [
    {
      id: "case",
      steps: [{ message: "hello", expect: { type: "answer" as const } }],
    },
  ],
};
it("advertises declared SDK defaults and enforces limits before any app setup", async () => {
  const setup = vi.fn();
  const runner = createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
    setup,
    defaults: execution.defaults,
    limits: execution.limits,
  });
  expect(runner.describe().execution.defaults).toEqual(execution.defaults);
  expect(runner.describe().execution.limits).toEqual(execution.limits);
  await expect(
    runner.run({ suiteId: suite.id, concurrency: 5 }),
  ).rejects.toThrow("application maximum");
  await expect(
    runner.run({ suiteId: suite.id, caseTimeoutMs: 300_001 }),
  ).rejects.toThrow("application maximum");
  expect(setup).not.toHaveBeenCalled();
});
it("honors a per-run case deadline and independently runs cleanup", async () => {
  const teardown = vi.fn();
  const runner = createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
    defaults: { caseTimeoutMs: 5000 },
    teardown,
    execute: async ({ signal }) => {
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      signal.throwIfAborted();
      return undefined as never;
    },
  });
  const result = await runner.run({ suiteId: suite.id, caseTimeoutMs: 15 });
  expect(result.cases[0]?.errors).toContainEqual(
    expect.objectContaining({
      code: "EVAL_TIMEOUT",
      details: { timeoutMs: 15 },
    }),
  );
  expect(teardown).toHaveBeenCalledOnce();
});

it("rejects invalid SDK defaults and unsupported timer sizes", async () => {
  expect(() =>
    createEvals({
      agent: { streamChat: vi.fn() },
      suites: [suite],
      defaults: { gradingTimeoutMs: 2_147_483_648 },
    }),
  ).toThrow("supported timer range");
  expect(() =>
    createEvals({
      agent: { streamChat: vi.fn() },
      suites: [suite],
      defaults: { concurrency: 3 },
      limits: { concurrency: 2 },
    }),
  ).toThrow("default exceeds");
  const runner = createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
  });
  await expect(
    runner.run({ suiteId: suite.id, caseTimeoutMs: 2_147_483_648 }),
  ).rejects.toThrow("supported timer range");
  await expect(
    runner.run({ suiteId: suite.id, gradingTimeoutMs: 2_147_483_648 }),
  ).rejects.toThrow("supported timer range");
});
it("returns a real original exception and cause without configuration, redacting only credentials", () => {
  const cause = new Error("Socket closed by upstream");
  const error = Object.assign(
    new Error(
      "Provider rejected the request: Authorization: Bearer test-secret-value",
      { cause },
    ),
    {
      statusCode: 429,
      responseBody: { error: "Rate limit exceeded", apiKey: "secret-value" },
    },
  );
  const issue = createEvalIssue("grading", error);
  expect(issue.message).toContain("Provider rejected the request");
  expect(issue.exception?.data.cause).toMatchObject({
    message: "Socket closed by upstream",
  });
  expect(issue.exception?.data.stack).toContain("Error: Provider rejected");
  expect(issue.exception?.data.responseBody).toEqual({
    error: "Rate limit exceeded",
    apiKey: "[REDACTED]",
  });
  expect(JSON.stringify(issue)).not.toContain("test-secret-value");
  expect(issue.details?.httpStatus).toBe(429);
});
it.each([
  0,
  600,
  429.5,
  Infinity,
  "429",
  undefined,
])("does not invent an HTTP status from %s", (status) => {
  expect(
    createEvalIssue(
      "execute",
      Object.assign(new Error("Actual failure"), { status }),
    ).details,
  ).toBeUndefined();
});
it("validates overrides at the HTTP boundary and forwards an allowed case timeout", async () => {
  const { createEvalRouteHandler } = await import("../src/evals/route-handler");
  const { getEvalSuiteRevision } = await import("../src/evals/revision");
  const runner = createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
    limits: { concurrency: 2, caseTimeoutMs: 300_000 },
    execute: () => ({
      observation: { type: "answer", text: "done", structured: [] },
    }),
  });
  const handler = createEvalRouteHandler({
    evals: runner,
    serviceKey: "settings-test-service-key-at-least-32-characters",
  });
  const request = (extra = {}) =>
    new Request("http://localhost/evals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization:
          "Bearer settings-test-service-key-at-least-32-characters",
      },
      body: JSON.stringify({
        suiteId: suite.id,
        suiteRevision: getEvalSuiteRevision(suite),
        ...extra,
      }),
    });
  try {
    expect((await handler(request({ concurrency: 3 }))).status).toBe(400);
    expect((await handler(request({ caseTimeoutMs: 300_001 }))).status).toBe(
      400,
    );
    expect(
      await (
        await handler(request({ caseTimeoutMs: 500, gradingTimeoutMs: 1000 }))
      ).text(),
    ).toContain('"passed"');
    expect(await (await handler(request())).text()).toContain('"passed"');
  } finally {
    await handler.close();
  }
});
it("keeps primitive exceptions and useful HTTP metadata when no message exists", () => {
  expect(createEvalIssue("execute", "Raw string rejection").message).toBe(
    "Raw string rejection",
  );
  expect(createEvalIssue("execute", { status: 500 }).message).toContain(
    "HTTP 500",
  );
});
it("keeps declared failures when an exception only supplies a failure descriptor", () => {
  const failure = {
    version: 1,
    code: "FIXTURE_FAILED",
    category: "internal",
    message: "The fixture was unavailable",
    retryable: false,
  };
  expect(createEvalIssue("setup", { failure }).message).toBe(
    "The fixture was unavailable",
  );
});
it("advertises an explicitly configured repetition default", () => {
  const runner = createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
    defaults: { repetitions: 3 },
  });
  expect(runner.describe().execution.defaults.repetitions).toBe(3);
});

it("resolves grading timeout through the same layers, checks App capabilities and reads legacy snapshots", () => {
  const application = {
    ...execution,
    defaults: { ...execution.defaults, gradingTimeoutMs: 90_000 },
    overrides: [...execution.overrides, "gradingTimeoutMs" as const],
  };
  const resolve = (run = {}, project = {}, installation = {}) =>
    resolveEvalSettings(run, project, application, installation);
  expect(resolve().values.gradingTimeoutMs).toBe(90_000);
  expect(
    resolve({}, {}, { gradingTimeoutMs: 100_000 }).values.gradingTimeoutMs,
  ).toBe(100_000);
  expect(
    resolve({}, { gradingTimeoutMs: 120_000 }, { gradingTimeoutMs: 100_000 })
      .values.gradingTimeoutMs,
  ).toBe(120_000);
  const selected = resolve(
    { gradingTimeoutMs: 180_000 },
    { gradingTimeoutMs: 120_000 },
    { gradingTimeoutMs: 100_000 },
  );
  expect(selected.values.gradingTimeoutMs).toBe(180_000);
  expect(selected.sources.gradingTimeoutMs).toBe("run");
  expect(() =>
    resolveEvalSettings(
      { judge: "app", gradingTimeoutMs: 180_000 },
      {},
      execution,
    ),
  ).toThrow("Update the consumer SDK");
  expect(
    resolveEvalSettings(
      { judge: "studio", gradingTimeoutMs: 180_000 },
      {},
      execution,
    ).values.gradingTimeoutMs,
  ).toBe(180_000);
  expect(() =>
    resolveEvalSettings(
      { gradingTimeoutMs: 300_001 },
      {},
      { ...application, limits: { gradingTimeoutMs: 300_000 } },
    ),
  ).toThrow("application maximum");
  const legacy = JSON.parse(JSON.stringify(selected));
  delete legacy.values.gradingTimeoutMs;
  delete legacy.sources.gradingTimeoutMs;
  const restored = ResolvedEvalSettingsSchema.parse(legacy);
  expect(restored.values.gradingTimeoutMs).toBe(60_000);
  expect(restored.sources.gradingTimeoutMs).toBe("studio-default");
});
it("honors the configured App grading deadline, retains diagnostic details and runs cleanup", async () => {
  const teardown = vi.fn();
  const runner = createEvals({
    agent: { streamChat: vi.fn() },
    suites: [
      {
        ...suite,
        cases: [
          {
            id: "one",
            steps: [
              {
                message: "hello",
                expect: { type: "answer", criteria: ["Correct"] },
              },
            ],
          },
        ],
      },
    ],
    judge: {
      id: "slow",
      version: "1",
      grade: () => new Promise<never>(() => {}),
    },
    execute: () => ({
      observation: { type: "answer", text: "hello", structured: [] },
    }),
    defaults: { caseTimeoutMs: 5000, gradingTimeoutMs: 2000 },
    teardown,
  });
  expect(runner.describe().execution.defaults.gradingTimeoutMs).toBe(2000);
  expect(runner.describe().execution.overrides).toContain("gradingTimeoutMs");
  const result = await runner.run({ suiteId: suite.id, gradingTimeoutMs: 10 });
  expect(result.cases[0]?.errors[0]).toMatchObject({
    code: "EVAL_GRADING_TIMEOUT",
    details: { timeoutMs: 10 },
    exception: {
      data: {
        message: "Grading exceeded its configured 0.01-second time limit.",
      },
    },
  });
  expect(teardown).toHaveBeenCalledOnce();
});
