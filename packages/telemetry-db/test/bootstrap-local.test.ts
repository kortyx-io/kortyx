import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  close: vi.fn().mockResolvedValue(undefined),
  upsertKey: vi.fn().mockResolvedValue({ keyId: "local-key" }),
}));

vi.mock("../src/index", () => ({
  createTelemetryDbClient: () => ({ db: {}, close: mocks.close }),
  ensureLocalDevelopmentProject: vi.fn().mockResolvedValue({
    organizationId: "local-org",
    projectId: "local-project",
  }),
  createTelemetryApiKey: vi.fn(),
  upsertTelemetryApiKey: mocks.upsertKey,
  seedDefaultModelRateCards: vi.fn().mockResolvedValue({
    inserted: 0,
    updated: 0,
    skipped: 0,
  }),
}));

describe("OSS bootstrap feature permissions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgres://local-test");
    vi.stubEnv("KORTYX_TELEMETRY_API_KEY", "test-sdk-key");
    vi.stubEnv("KORTYX_STUDIO_API_KEY", "test-studio-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    undefined,
    "0",
    "1",
  ])("grants all OSS features with legacy flags %s", async (flag) => {
    for (const feature of ["PROMPTS", "DIAGNOSTICS", "REVIEWS", "EVALS"]) {
      vi.stubEnv(`KORTYX_STUDIO_ENABLE_${feature}`, flag);
    }
    await import("../src/scripts/bootstrap-local");
    await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());

    expect(mocks.upsertKey).toHaveBeenNthCalledWith(
      1,
      {},
      expect.objectContaining({
        apiKey: "test-sdk-key",
        scopes: ["telemetry:write", "prompt:serve"],
      }),
    );
    expect(mocks.upsertKey).toHaveBeenNthCalledWith(
      2,
      {},
      expect.objectContaining({
        apiKey: "test-studio-key",
        scopes: [
          "studio:read",
          "studio:write",
          "prompt:promote",
          "prompt:review",
          "prompt:settings",
          "diagnostics:read",
          "eval:run",
        ],
      }),
    );
  });

  it("reapplies feature permissions to stored keys on subsequent bootstraps", async () => {
    await import("../src/scripts/bootstrap-local");
    await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
    const firstKeys = mocks.upsertKey.mock.calls.map((call) => call[1]);
    vi.resetModules();
    await import("../src/scripts/bootstrap-local");
    await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledTimes(2));
    expect(mocks.upsertKey.mock.calls.slice(2).map((call) => call[1])).toEqual(
      firstKeys,
    );
  });
});
