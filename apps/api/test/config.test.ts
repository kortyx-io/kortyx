import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadApiConfig } from "../src/config";

beforeEach(() => {
  vi.stubEnv(
    "DATABASE_URL",
    "postgres://fixture@127.0.0.1/kortyx_api_extension_test",
  );
  vi.stubEnv("KORTYX_API_DEPLOYMENT", "self-hosted");
  vi.stubEnv("KORTYX_API_KEY_PEPPER", "fixture");
  vi.stubEnv("KORTYX_API_EVAL_WORKER_ENABLED", "true");
  vi.stubEnv("KORTYX_EVAL_MAX_CONCURRENT_EVALUATIONS", "4");
});

it("supports web-only replicas with a validated shared execution limit", () => {
  vi.stubEnv("KORTYX_API_EVAL_WORKER_ENABLED", "false");
  vi.stubEnv("KORTYX_EVAL_MAX_CONCURRENT_EVALUATIONS", "1");
  expect(loadApiConfig()).toMatchObject({
    evalWorkerEnabled: false,
    evalMaxConcurrentEvaluations: 1,
  });
  vi.stubEnv("KORTYX_API_EVAL_WORKER_ENABLED", "False");
  expect(() => loadApiConfig()).toThrow(/must be true or false/);
});

it.each([
  "0",
  "-1",
  "1.5",
  "NaN",
  "Infinity",
  "1e3",
  "9007199254740992",
])("rejects invalid execution limit %s", (value) => {
  vi.stubEnv("KORTYX_EVAL_MAX_CONCURRENT_EVALUATIONS", value);
  expect(() => loadApiConfig()).toThrow(/must be a positive integer/);
});
afterEach(() => vi.unstubAllEnvs());

it("selects self-hosted and cloud deployment explicitly", () => {
  expect(loadApiConfig().deployment).toBe("self-hosted");
  vi.stubEnv("KORTYX_API_DEPLOYMENT", "cloud");
  expect(loadApiConfig().deployment).toBe("cloud");
});

it("rejects unknown deployment values instead of falling back to OSS", () => {
  vi.stubEnv("KORTYX_API_DEPLOYMENT", "clodu");
  expect(() => loadApiConfig()).toThrow(/must be self-hosted or cloud/);
});
