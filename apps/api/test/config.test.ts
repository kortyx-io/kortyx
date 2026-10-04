import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadApiConfig } from "../src/config";

beforeEach(() => {
  vi.stubEnv(
    "DATABASE_URL",
    "postgres://fixture@127.0.0.1/kortyx_api_extension_test",
  );
  vi.stubEnv("KORTYX_API_DEPLOYMENT", "self-hosted");
  vi.stubEnv("KORTYX_API_KEY_PEPPER", "fixture");
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
