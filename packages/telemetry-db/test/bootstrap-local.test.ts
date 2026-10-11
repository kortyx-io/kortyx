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

describe("local bootstrap prompt permissions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgres://local-test");
    vi.stubEnv("KORTYX_TELEMETRY_API_KEY", "test-sdk-key");
    vi.stubEnv("KORTYX_STUDIO_API_KEY", "test-studio-key");
    vi.stubEnv("KORTYX_STUDIO_ENABLE_DIAGNOSTICS", "0");
    vi.stubEnv("KORTYX_STUDIO_ENABLE_REVIEWS", "0");
    vi.stubEnv("KORTYX_STUDIO_ENABLE_EVALS", "0");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    undefined,
    "",
    "1",
  ])("grants local prompt permissions with flag %s", async (flag) => {
    vi.stubEnv("KORTYX_STUDIO_ENABLE_PROMPTS", flag);
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
        ],
      }),
    );
  });

  it("honors an explicit opt-out", async () => {
    vi.stubEnv("KORTYX_STUDIO_ENABLE_PROMPTS", "0");
    await import("../src/scripts/bootstrap-local");
    await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());

    expect(mocks.upsertKey).toHaveBeenNthCalledWith(
      1,
      {},
      expect.objectContaining({ scopes: ["telemetry:write"] }),
    );
    expect(mocks.upsertKey).toHaveBeenNthCalledWith(
      2,
      {},
      expect.objectContaining({ scopes: ["studio:read"] }),
    );
  });
});
