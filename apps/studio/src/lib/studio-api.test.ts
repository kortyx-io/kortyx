import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("retains the API code and request ID for actionable failure rendering", async () => {
  vi.stubEnv("KORTYX_API_URL", "http://studio.test");
  vi.stubEnv("KORTYX_STUDIO_API_KEY", "test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: "INTERNAL_SERVER_ERROR",
            message: "Internal server error.",
            requestId: "request-1",
          }),
          { status: 500 },
        ),
    ),
  );
  const { getStudioRunDetail } = await import("./studio-api");
  expect(await getStudioRunDetail("run-1")).toEqual({
    data: null,
    error: {
      type: "http",
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error.",
      requestId: "request-1",
    },
  });
});
