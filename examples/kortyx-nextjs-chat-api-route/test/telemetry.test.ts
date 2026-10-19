import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { createAdapter } = vi.hoisted(() => ({ createAdapter: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@kortyx/telemetry", () => ({
  createKortyxTelemetryAdapter: createAdapter,
}));

beforeEach(() => {
  vi.resetModules();
  createAdapter.mockReset().mockReturnValue({ flush: vi.fn() });
  globalThis.__kortyxChatTelemetry = undefined;
  vi.stubEnv("KORTYX_TELEMETRY_API_URL", "http://localhost:6400");
  vi.stubEnv("KORTYX_TELEMETRY_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.__kortyxChatTelemetry = undefined;
});

it.each([
  [undefined, true],
  ["true", true],
  ["false", false],
])("configures content capture for env %s as %s", async (value, expected) => {
  vi.stubEnv("KORTYX_TELEMETRY_CAPTURE_CONTENT", value);
  await import("../src/lib/telemetry");
  expect(createAdapter).toHaveBeenCalledWith(
    expect.objectContaining({ captureContent: expected }),
  );
});

it("configures Cloud telemetry with a project key and no endpoint", async () => {
  vi.stubEnv("KORTYX_TELEMETRY_API_URL", undefined);
  vi.stubEnv("KORTYX_API_URL", undefined);
  const { telemetry } = await import("../src/lib/telemetry");
  expect(telemetry).toBeDefined();
  expect(createAdapter).toHaveBeenCalledWith(
    expect.objectContaining({ apiKey: "test-key", endpoint: undefined }),
  );
});

it("does not enable telemetry without credentials", async () => {
  vi.stubEnv("KORTYX_TELEMETRY_API_KEY", undefined);
  const { telemetry } = await import("../src/lib/telemetry");
  expect(telemetry).toBeUndefined();
  expect(createAdapter).not.toHaveBeenCalled();
});
