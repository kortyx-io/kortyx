import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { createAdapter } = vi.hoisted(() => ({ createAdapter: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@kortyx/telemetry", () => ({
  createKortyxTelemetryAdapter: createAdapter,
}));

beforeEach(() => {
  vi.resetModules();
  createAdapter.mockReset().mockReturnValue({ flush: vi.fn() });
  globalThis.__kortyxCanvasTelemetryAdapter = undefined;
  vi.stubEnv("KORTYX_TELEMETRY_API_URL", "http://localhost:6400");
  vi.stubEnv("KORTYX_TELEMETRY_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.__kortyxCanvasTelemetryAdapter = undefined;
});

it.each([
  [undefined, true],
  ["true", true],
  ["false", false],
])("configures content capture for env %s as %s", async (value, expected) => {
  vi.stubEnv("KORTYX_TELEMETRY_CAPTURE_CONTENT", value);
  const { getCanvasTelemetryAdapter } = await import("./telemetry");
  getCanvasTelemetryAdapter();
  expect(createAdapter).toHaveBeenCalledWith(
    expect.objectContaining({ captureContent: expected }),
  );
});

it("does not enable telemetry without credentials", async () => {
  vi.stubEnv("KORTYX_TELEMETRY_API_KEY", undefined);
  const { getCanvasTelemetryAdapter } = await import("./telemetry");
  expect(getCanvasTelemetryAdapter()).toBeUndefined();
  expect(createAdapter).not.toHaveBeenCalled();
});
