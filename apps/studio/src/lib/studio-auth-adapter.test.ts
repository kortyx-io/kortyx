import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  authorize: vi.fn(),
  getApiCredential: vi.fn(),
  handleAuthRequest: vi.fn(),
}));
vi.mock("@studio/auth", () => ({ studioAuth: auth }));
vi.mock("server-only", () => ({}));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("KORTYX_API_URL", "https://api.test");
  vi.stubEnv("KORTYX_STUDIO_API_KEY", "never-fall-back-to-this-key");
  auth.authorize.mockReset().mockResolvedValue(null);
  auth.getApiCredential
    .mockReset()
    .mockImplementation(async (request?: Request) => ({
      authorization: `Bearer ${request?.headers.get("x-test-session") ?? "server-session-a"}`,
    }));
  auth.handleAuthRequest
    .mockReset()
    .mockResolvedValue(Response.json({ flow: "handled" }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const request = (session: string, method = "GET") =>
  new Request("https://studio.test/api/studio/evals/runs", {
    method,
    headers: {
      "x-test-session": session,
      origin: "https://studio.test",
      "x-kortyx-review": "1",
      "x-kortyx-eval": "1",
      "content-type": "application/json",
    },
    ...(method === "POST" ? { body: JSON.stringify({ suiteId: "test" }) } : {}),
  });

it("SSR reads resolve a fresh session credential on each call", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => Response.json({}, { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  const { getStudioRunDetail } = await import("./studio-api");
  await getStudioRunDetail("one");
  auth.getApiCredential.mockResolvedValue({
    authorization: "Bearer server-session-b",
  });
  await getStudioRunDetail("two");
  expect(
    fetcher.mock.calls.map((call) => call[1].headers.authorization),
  ).toEqual(["Bearer server-session-a", "Bearer server-session-b"]);
});

it("review and eval requests forward only their own session credential", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  const { studioReviewRequest } = await import("./studio-reviews");
  const { proxyEvalRequest } = await import("../features/evals/api/proxy");
  expect(
    (await studioReviewRequest(request("user-a", "DELETE"), "run")).status,
  ).toBe(200);
  expect(
    (await proxyEvalRequest(request("user-b", "POST"), ["runs"])).status,
  ).toBe(200);
  expect(
    fetcher.mock.calls.map((call) => call[1].headers.authorization),
  ).toEqual(["Bearer user-a", "Bearer user-b"]);
});

it("realtime reads authenticate directly and use request-scoped credentials", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(
      async () => new Response("event: change\ndata: {}\n\n"),
    );
  vi.stubGlobal("fetch", fetcher);
  const { GET } = await import("../app/api/studio/changes/route");
  expect((await GET(request("stream-a"))).status).toBe(200);
  expect((await GET(request("stream-b"))).status).toBe(200);
  expect(
    fetcher.mock.calls.map((call) => call[1].headers.authorization),
  ).toEqual(["Bearer stream-a", "Bearer stream-b"]);
});

it("server-side eval reads use the auth adapter rather than the environment key", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => Response.json({}, { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  const { readEvalTargets } = await import("../features/evals/api/server");
  await expect(readEvalTargets()).rejects.toThrow(
    "Eval service is unavailable",
  );
  expect(fetcher.mock.calls[0]?.[1].headers.authorization).toBe(
    "Bearer server-session-a",
  );
});

it("no session credential never falls back to the global key", async () => {
  auth.getApiCredential.mockResolvedValue(null);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const { getStudioRunDetail } = await import("./studio-api");
  const { studioReviewRequest } = await import("./studio-reviews");
  const { proxyEvalRequest } = await import("../features/evals/api/proxy");
  const { GET } = await import("../app/api/studio/changes/route");
  expect((await getStudioRunDetail("one")).error?.type).toBe("not_configured");
  expect(
    (await studioReviewRequest(request("none", "DELETE"), "run")).status,
  ).toBe(503);
  expect(
    (await proxyEvalRequest(request("none", "POST"), ["runs"])).status,
  ).toBe(503);
  expect((await GET(request("none"))).status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
});

it("denied browser requests never reach credential resolution or the API", async () => {
  auth.authorize.mockImplementation(
    async () => new Response("Denied", { status: 401 }),
  );
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const { studioReviewRequest } = await import("./studio-reviews");
  const { proxyEvalRequest } = await import("../features/evals/api/proxy");
  const { GET } = await import("../app/api/studio/changes/route");
  expect(
    (await studioReviewRequest(request("none", "DELETE"), "run")).status,
  ).toBe(401);
  expect(
    (await proxyEvalRequest(request("none", "POST"), ["runs"])).status,
  ).toBe(401);
  expect((await GET(request("none"))).status).toBe(401);
  expect(auth.getApiCredential).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});

it("auth handlers delegate GET and POST with their original request", async () => {
  const handlers = await import("../app/auth/[...action]/route");
  const login = new Request("https://studio.test/auth/login");
  const logout = new Request("https://studio.test/auth/logout", {
    method: "POST",
  });
  await handlers.GET(login);
  await handlers.POST(logout);
  expect(auth.handleAuthRequest.mock.calls.map((call) => call[0])).toEqual([
    login,
    logout,
  ]);
});
