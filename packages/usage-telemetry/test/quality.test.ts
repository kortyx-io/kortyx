import { afterEach, expect, it, vi } from "vitest";
import { publicCatalog } from "../src/catalog";
import {
  createUsageTelemetry,
  type UsageRecord,
  type UsageTelemetry,
} from "../src/client";
import { classifyUsageError, classifyUsageHttpStatus } from "../src/failure";
import { publicUsageConfiguration, runtimeUsageContext } from "../src/node";

const clients: UsageTelemetry[] = [];
afterEach(() => {
  clients.forEach((c) => {
    c.dispose();
  });
  vi.unstubAllEnvs();
});
function fixture(
  overrides: Partial<Parameters<typeof createUsageTelemetry>[0]> = {},
) {
  const records: UsageRecord[] = [];
  const transport = vi.fn(async (batch: readonly UsageRecord[]) => {
    records.push(...batch);
  });
  const client = createUsageTelemetry({
    context: { product: "sdk", component: "agent", version: "1.0.0" },
    identity: () => "ae037bc5-7773-42b7-9664-26328dcd121c",
    transport,
    ...overrides,
  });
  clients.push(client);
  return { client, records, transport };
}
it.each([
  [401, "HTTP_UNAUTHORIZED", false],
  [403, "HTTP_FORBIDDEN", false],
  [404, "HTTP_NOT_FOUND", false],
  [408, "HTTP_TIMEOUT", true],
  [409, "HTTP_CONFLICT", false],
  [413, "HTTP_TOO_LARGE", false],
  [429, "HTTP_RATE_LIMITED", true],
  [422, "HTTP_INVALID_REQUEST", false],
  [503, "HTTP_SERVER_ERROR", true],
  [504, "HTTP_TIMEOUT", true],
])("classifies HTTP %i from status alone", (status, code, retryable) => {
  expect(classifyUsageHttpStatus(status)).toMatchObject({
    outcome: "failed",
    properties: { error_code: code, retryable },
  });
});
it("bounds HTTP facts and sanitizes even the exported classifier", () => {
  expect(classifyUsageHttpStatus(200)).toEqual({
    outcome: "success",
    properties: { http_status_class: "2xx" },
  });
  expect(classifyUsageHttpStatus(NaN).properties.error_code).toBe(
    "UNCLASSIFIED_FAILURE",
  );
  expect(
    classifyUsageError({
      code: "EXECUTION_FAILED",
      category: "customer-secret",
    }).properties.error_category,
  ).toBe("unknown");
});
it("projects framework descriptors and wrapped network causes without invoking getters or copying diagnostics", () => {
  const getter = vi.fn(() => {
    throw new Error("customer-secret");
  });
  const error = {
    code: "PROVIDER_TRANSPORT_ERROR",
    failure: {
      code: "PROVIDER_TRANSPORT_ERROR",
      category: "provider",
      retryable: true,
    },
    cause: { code: "ECONNRESET", message: "customer-secret" },
  };
  Object.defineProperty(error, "message", { get: getter });
  Object.defineProperty(error, "category", { get: getter });
  expect(classifyUsageError(error)).toEqual({
    outcome: "failed",
    properties: {
      error_code: "PROVIDER_TRANSPORT_ERROR",
      error_category: "provider",
      retryable: true,
      cause_code: "NETWORK_CONNECTION_RESET",
      cause_category: "transport",
    },
  });
  const cycle: { cause?: unknown } = {};
  cycle.cause = cycle;
  expect(classifyUsageError(cycle).properties.error_code).toBe("other");
  expect(
    classifyUsageError(new Proxy({}, { getOwnPropertyDescriptor: getter }))
      .properties.error_code,
  ).toBe("other");
  expect(getter).toHaveBeenCalled(); // Proxy traps may throw; application property getters must not run.
  getter.mockClear();
  classifyUsageError(error);
  expect(getter).not.toHaveBeenCalled();
});
it("recognizes native aborts, configuration errors and preserves root failures over nested control flow", () => {
  expect(
    classifyUsageError(new DOMException("secret", "AbortError")).outcome,
  ).toBe("cancelled");
  expect(
    classifyUsageError({ name: "EvalConfigurationError" }).properties
      .error_code,
  ).toBe("EVAL_SETTINGS_INVALID");
  expect(
    classifyUsageError({
      code: "EXECUTION_FAILED",
      cause: { name: "AbortError" },
    }).outcome,
  ).toBe("failed");
  expect(
    classifyUsageError({ cause: { code: "ENOTFOUND" } }).properties.error_code,
  ).toBe("NETWORK_DNS_FAILED");
});
it("provides explicit counting units and failure defaults without changing schema compatibility", async () => {
  const f = fixture();
  f.client.start("sdk.structured", { format: "text-delta" }).end();
  f.client.start("sdk.structured", { format: "final" }).end();
  f.client.start("sdk.model").end("failed");
  f.client
    .start("studio.eval", { origin: "background" })
    .end("failed", { http_status: "503" });
  f.client.start("studio.eval.execution").end();
  f.client.feature("sdk.registry", { origin: "server" });
  await f.client.flush();
  expect(f.records.map((r) => r.properties.measurement_kind)).toEqual([
    "chunk",
    "output",
    "attempt",
    "poll",
    "execution",
    "observation",
  ]);
  expect(f.records[2]).toMatchObject({
    schema_version: 1,
    properties: {
      measurement_version: "2",
      error_code: "UNCLASSIFIED_FAILURE",
      error_category: "unknown",
    },
  });
  expect(f.records[3]?.properties).toMatchObject({
    error_code: "HTTP_SERVER_ERROR",
    http_status_class: "5xx",
    retryable: true,
  });
});
it("reports lost observations once on subsequent normal delivery, including failed batches and grouped counts", async () => {
  const f = fixture({ maxGroups: 1 });
  f.client.feature("sdk.initialize");
  f.client.feature("sdk.model");
  f.client.feature("sdk.model");
  f.transport.mockRejectedValueOnce(new Error("offline"));
  await f.client.flush();
  f.client.feature("sdk.initialize");
  await f.client.flush();
  expect(f.records[0]?.delivery_health).toEqual({
    dropped_observations: 3,
    failed_batches: 1,
  });
  f.client.feature("sdk.initialize");
  await f.client.flush();
  expect(f.records[1]?.delivery_health).toBeUndefined();
});
it("counts hourly budget losses as observations and never bypasses the budget for health", async () => {
  let time = 0;
  const f = fixture({ now: () => time, maxRecordsPerHour: 1 });
  f.client.feature("sdk.initialize");
  for (let i = 0; i < 4; i++) f.client.feature("sdk.model");
  await f.client.flush();
  expect(f.records).toHaveLength(1);
  expect(f.records[0]?.delivery_health).toEqual({
    dropped_observations: 4,
    failed_batches: 0,
  });
  f.client.feature("sdk.initialize");
  await f.client.flush();
  expect(f.records).toHaveLength(1);
  time = 3600000;
  f.client.feature("sdk.initialize");
  await f.client.flush();
  expect(f.records[1]?.delivery_health).toEqual({
    dropped_observations: 1,
    failed_batches: 0,
  });
});
it("respects opt-out after losses without extra identity work or health traffic", async () => {
  let enabled = true;
  const identity = vi.fn(() => "invalid");
  const f = fixture({ enabled: () => enabled, identity });
  f.client.feature("sdk.initialize");
  await f.client.flush();
  enabled = false;
  f.client.feature("sdk.model");
  await f.client.flush();
  expect(identity).toHaveBeenCalledOnce();
  expect(f.transport).not.toHaveBeenCalled();
});
it("allows generic edition replacement and an explicit measurement unit without another public event", async () => {
  const f = fixture({
    context: {
      product: "edition_studio",
      component: "edition_worker",
      version: "1.0.0",
      runtimeMode: "production",
      trafficSource: "synthetic",
      environment: "staging",
    },
    catalog: {
      ...publicCatalog,
      products: [...publicCatalog.products, "edition_studio"],
      operations: [...publicCatalog.operations, "edition.eval"],
    },
  });
  f.client.start("edition.eval", { measurement_kind: "execution" }).fail({
    code: "EVAL_RUN_TIMEOUT",
    category: "workflow",
    message: "private",
  });
  await f.client.flush();
  expect(f.records).toHaveLength(1);
  expect(f.records[0]).toMatchObject({
    product: "edition_studio",
    analytics_environment: "staging",
    runtime_mode: "production",
    properties: {
      measurement_kind: "execution",
      traffic_source: "synthetic",
      error_code: "EVAL_RUN_TIMEOUT",
    },
  });
  expect(JSON.stringify(f.records)).not.toContain("private");
});
it("derives runtime separately from analytics environment and uses only explicit approved traffic labels", () => {
  vi.stubEnv("CI", "true");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("KORTYX_USAGE_TELEMETRY_TRAFFIC_SOURCE", "internal");
  expect(runtimeUsageContext()).toEqual({
    runtimeMode: "ci",
    trafficSource: "internal",
  });
  vi.stubEnv("CI", "false");
  vi.stubEnv("KORTYX_USAGE_TELEMETRY_TRAFFIC_SOURCE", "customer-name");
  expect(runtimeUsageContext()).toEqual({
    runtimeMode: "production",
    trafficSource: "unknown",
  });
  expect(publicUsageConfiguration()).toMatchObject({
    runtimeMode: "production",
    trafficSource: "unknown",
  });
});
it("classifies native parsing failures without serializing the failed JSON or message", () => {
  const failure = classifyUsageError(new SyntaxError("customer-secret-json"));
  expect(failure.properties).toEqual({
    error_code: "SCHEMA_VALIDATION",
    error_category: "validation",
  });
  expect(JSON.stringify(failure)).not.toContain("customer-secret");
});

it("does not treat the generic execution serializer fallback as proof of an internal defect", () => {
  expect(
    classifyUsageError({
      code: "EXECUTION_FAILED",
      failure: { code: "EXECUTION_FAILED", category: "internal" },
      cause: { code: "ECONNREFUSED" },
    }).properties,
  ).toMatchObject({
    error_code: "EXECUTION_FAILED",
    error_category: "unknown",
    cause_code: "NETWORK_CONNECTION_REFUSED",
    cause_category: "transport",
  });
});
