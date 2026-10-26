import {
  createUsageTelemetry,
  type UsageRecord,
  type UsageTelemetry,
} from "@kortyx/usage-telemetry";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@studio/auth", () => ({ studioAuth: { getApiCredential: vi.fn() } }));
vi.mock("@studio/usage", () => ({
  studioUsage: { server: { start: vi.fn() } },
}));
vi.mock("@/features/sample-project/server", () => ({
  isSampleProject: vi.fn(),
  readSampleProjectPreference: vi.fn(),
}));

import { studioAuth } from "@studio/auth";
import { studioUsage } from "@studio/usage";
import {
  isSampleProject,
  readSampleProjectPreference,
} from "@/features/sample-project/server";
import { readEvalTargets, readEvaluationHistory } from "./server";

let usage: UsageTelemetry;
let records: UsageRecord[];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("KORTYX_API_URL", "http://api:6400");
  records = [];
  usage = createUsageTelemetry({
    context: {
      product: "oss_studio",
      component: "studio_api",
      version: "1.0.0",
    },
    identity: () => "00000000-0000-4000-8000-000000000001",
    transport: async (batch) => {
      records.push(...batch);
    },
  });
  vi.mocked(studioUsage.server.start).mockImplementation(usage.start);
  vi.mocked(studioAuth.getApiCredential).mockResolvedValue({
    authorization: "Bearer PRIVATE_KEY",
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  usage.dispose();
});

it("reads additive judge capabilities without dropping the eval page data", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        targets: [],
        canRun: true,
        studioJudge: {
          id: "judge",
          version: "1",
          location: "studio",
          futureCapability: "PRIVATE_VALUE",
        },
      }),
    ),
  );
  await expect(readEvalTargets()).resolves.toEqual({
    targets: [],
    canRun: true,
    studioJudge: { id: "judge", version: "1", location: "studio" },
  });
  await usage.flush();
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    operation: "studio.read",
    outcome: "success",
    properties: { resource: "evals", origin: "server" },
  });
  expect(JSON.stringify(records)).not.toContain("PRIVATE");
});

it.each([
  "parse",
  "http",
  "network",
])("reports an eval %s failure through existing usage telemetry without payloads", async (phase) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (phase === "network") throw new Error("PRIVATE_NETWORK_DETAIL");
      return Response.json(
        { privateField: "PRIVATE_RESPONSE_BODY" },
        { status: phase === "http" ? 502 : 200 },
      );
    }),
  );
  await expect(readEvalTargets()).rejects.toThrow();
  await usage.flush();
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    operation: "studio.read",
    outcome: "failed",
    properties: { resource: "evals", phase },
  });
  if (phase === "parse")
    expect(records[0]?.properties.error_code).toBe("STUDIO_RESPONSE_INVALID");
  expect(JSON.stringify(records)).not.toMatch(/PRIVATE|api:6400|Bearer/);
});

it("does not report an aborted read as a compatibility failure", async () => {
  const controller = new AbortController();
  controller.abort();
  const error = new DOMException("PRIVATE_ABORT", "AbortError");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw error;
    }),
  );
  await expect(
    readEvaluationHistory(
      new Request("http://studio/evals", { signal: controller.signal }),
    ),
  ).rejects.toBe(error);
  await usage.flush();
  expect(records).toHaveLength(1);
  expect(records[0]?.outcome).toBe("cancelled");
});

it("reports the read kind and approved schema issue without leaking judge data", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        targets: [],
        canRun: true,
        studioJudge: { id: 42, version: "PRIVATE_VERSION" },
      }),
    ),
  );
  await expect(readEvalTargets()).rejects.toThrow();
  await usage.flush();
  expect(records[0]).toMatchObject({
    operation: "studio.read",
    outcome: "failed",
    properties: {
      resource: "evals",
      action: "view",
      origin: "server",
      eval_read: "targets",
      phase: "parse",
      error_code: "STUDIO_RESPONSE_INVALID",
      error_category: "validation",
      cause_code: "SCHEMA_VALIDATION",
      response_failure: "schema",
      validation_issue: "invalid_type",
      validation_field: "studioJudge",
      retryable: false,
    },
  });
  expect(JSON.stringify(records)).not.toContain("PRIVATE");
});

it("distinguishes malformed JSON and wrapped network failures using the existing classifier", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("PRIVATE_INVALID_JSON")),
  );
  await expect(readEvalTargets()).rejects.toThrow();
  await usage.flush();
  expect(records[0]?.properties).toMatchObject({
    response_failure: "json",
    cause_code: "SCHEMA_VALIDATION",
    eval_read: "targets",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("PRIVATE_NETWORK", { cause: { code: "ECONNREFUSED" } });
    }),
  );
  await expect(readEvaluationHistory()).rejects.toThrow();
  await usage.flush();
  expect(records[1]?.properties).toMatchObject({
    eval_read: "evaluations",
    phase: "network",
    error_code: "NETWORK_CONNECTION_REFUSED",
    retryable: true,
  });
  expect(JSON.stringify(records)).not.toContain("PRIVATE");
});

it("keeps successful reads independent of telemetry opt-out and delivery failure", async () => {
  const transport = vi.fn(async () => {
    throw new Error("PRIVATE_ANALYTICS_FAILURE");
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ targets: [], canRun: false })),
  );
  for (const enabled of [false, true]) {
    usage.dispose();
    usage = createUsageTelemetry({
      enabled: () => enabled,
      context: {
        product: "oss_studio",
        component: "studio_api",
        version: "1.0.0",
      },
      identity: () => "00000000-0000-4000-8000-000000000001",
      transport,
    });
    vi.mocked(studioUsage.server.start).mockImplementation(usage.start);
    await expect(readEvalTargets()).resolves.toEqual({
      targets: [],
      canRun: false,
    });
    await expect(usage.flush()).resolves.toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(enabled ? 1 : 0);
  }
});
it("uses request-scoped credentials for modal reads and keeps project/environment scope", async () => {
  const request = new Request("http://studio/api/studio/evals/comparison");
  vi.mocked(studioAuth.getApiCredential).mockResolvedValue({
    authorization: "Bearer server-key",
    projectId: "project",
    environmentId: "env-id",
    environment: "test",
  });
  const fetch = vi.fn().mockResolvedValue(Response.json({ runs: [] }));
  vi.stubGlobal("fetch", fetch);
  await expect(readEvaluationHistory(request)).resolves.toEqual({ runs: [] });
  expect(studioAuth.getApiCredential).toHaveBeenCalledWith(request);
  expect(isSampleProject).toHaveBeenCalledWith(request);
  expect(fetch.mock.calls[0][1]).toMatchObject({
    headers: {
      authorization: "Bearer server-key",
      "x-kortyx-project-id": "project",
      "x-kortyx-environment-id": "env-id",
      "x-kortyx-environment": "test",
    },
    cache: "no-store",
    redirect: "error",
  });
});
it("rejects hidden or unavailable sample preferences without accessing the API", async () => {
  vi.mocked(isSampleProject).mockResolvedValue(true);
  vi.mocked(readSampleProjectPreference).mockResolvedValue({
    visible: false,
    available: true,
  });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    readEvaluationHistory(
      new Request("http://studio/api/studio/evals/comparison"),
    ),
  ).rejects.toThrow("Sample project is unavailable");
  expect(studioAuth.getApiCredential).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(studioUsage.server.start).not.toHaveBeenCalled();
});

it("reports missing configuration once with an actionable stable code", async () => {
  vi.stubEnv("KORTYX_API_URL", "");
  await expect(readEvalTargets()).rejects.toThrow(
    "Studio API is not configured",
  );
  await usage.flush();
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    outcome: "failed",
    properties: {
      eval_read: "targets",
      phase: "configuration",
      error_code: "STUDIO_NOT_CONFIGURED",
      retryable: false,
    },
  });
});
