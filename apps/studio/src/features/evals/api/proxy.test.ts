import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { proxyEvalRequest } from "./proxy";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.stubEnv("KORTYX_STUDIO_AUTH_MODE", "none");
  vi.stubEnv("KORTYX_API_URL", "http://api:6400");
  vi.stubEnv("KORTYX_STUDIO_API_KEY", "private-studio-key");
});
const request = (origin = "http://localhost:7340", marker = "1") =>
  new Request("http://localhost:7340/api/studio/evals/runs", {
    method: "POST",
    headers: {
      origin,
      "x-kortyx-eval": marker,
      "content-type": "application/json",
    },
    body: '{"suiteId":"jobs"}',
  });
it("rejects cross-origin writes and missing app marker before touching the API", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(
    (await proxyEvalRequest(request("https://other.example"), ["runs"])).status,
  ).toBe(403);
  expect(
    (await proxyEvalRequest(request("http://localhost:7340", ""), ["runs"]))
      .status,
  ).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it("requires Studio browser authentication when basic auth is enabled", async () => {
  vi.stubEnv("KORTYX_STUDIO_AUTH_MODE", "basic");
  vi.stubEnv("KORTYX_STUDIO_BASIC_AUTH_USERNAME", "user");
  vi.stubEnv("KORTYX_STUDIO_BASIC_AUTH_PASSWORD", "password");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect((await proxyEvalRequest(request(), ["runs"])).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps server credentials in the forwarded request and does not return API error bodies", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({ error: "PRIVATE CONSUMER TOKEN" }, { status: 409 }),
    );
  vi.stubGlobal("fetch", fetch);
  const response = await proxyEvalRequest(request(), ["runs"]);
  expect(fetch.mock.calls[0]?.[0]).toBe("http://api:6400/v1/studio/evals/runs");
  expect(fetch.mock.calls[0]?.[1]?.headers.authorization).toBe(
    "Bearer private-studio-key",
  );
  expect(await response.text()).not.toContain("PRIVATE CONSUMER TOKEN");
  expect(response.status).toBe(409);
});
it("allows only the fixed eval paths", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect((await proxyEvalRequest(request(), ["..", "admin"])).status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});
