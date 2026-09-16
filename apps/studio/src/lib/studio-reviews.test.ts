import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/studio/runs/[runId]/review/route";
import { studioReviewRequest } from "./studio-reviews";

const auth = `Basic ${Buffer.from("admin:password").toString("base64")}`;
const score = {
  id: "00000000-0000-4000-8000-000000000001",
  target: { type: "run", runId: "run/a%2Fb" },
  environment: "test",
  name: "correctness",
  dataType: "CATEGORICAL",
  value: "incorrect",
  source: "human-review",
  actorId: "studio-key:key",
  reasons: [],
  comment: null,
  createdAt: "2026-09-16T12:00:00.000Z",
  updatedAt: "2026-09-16T12:00:00.000Z",
};
const request = (
  body: unknown = { value: "incorrect" },
  headers: Record<string, string> = {},
  method = "POST",
) =>
  new Request("http://studio.test/api/studio/runs/run/review", {
    method,
    headers: {
      origin: "http://studio.test",
      authorization: auth,
      "x-kortyx-review": "1",
      "content-type": "application/json",
      ...headers,
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });

beforeEach(() => {
  vi.stubEnv("KORTYX_STUDIO_AUTH_MODE", "basic");
  vi.stubEnv("KORTYX_STUDIO_BASIC_AUTH_USERNAME", "admin");
  vi.stubEnv("KORTYX_STUDIO_BASIC_AUTH_PASSWORD", "password");
  vi.stubEnv("KORTYX_API_URL", "http://api.test/");
  vi.stubEnv("KORTYX_STUDIO_API_KEY", "private-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Studio review proxy", () => {
  it("requires authentication even when invoked without Next's proxy", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await studioReviewRequest(
          request(undefined, { authorization: "" }),
          "run",
        )
      ).status,
    ).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([
    { origin: "http://evil.test" },
    { origin: "bad-origin" },
    { origin: "" },
    { "x-kortyx-review": "" },
  ])("rejects CSRF requests: %j", async (headers) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (await studioReviewRequest(request(undefined, headers), "run")).status,
    ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("validates the body before sending private credentials upstream", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await studioReviewRequest(
          request({ value: "incorrect", actorId: "forged" }),
          "run",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await studioReviewRequest(
          request({ value: "incorrect", comment: "x".repeat(17000) }),
          "run",
        )
      ).status,
    ).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("encodes opaque run IDs once, keeps the key server-side, and parses saved scores", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ score }));
    vi.stubGlobal("fetch", fetch);
    const response = await studioReviewRequest(request(), "run/a%2Fb");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ score });
    expect(fetch).toHaveBeenCalledWith(
      "http://api.test/v1/studio/runs/run%2Fa%252Fb/review",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer private-key",
          "content-type": "application/json",
        },
      }),
    );
  });
  it("clears a review without a caller-controlled actor or body", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    expect(
      (await studioReviewRequest(request(undefined, {}, "DELETE"), "run"))
        .status,
    ).toBe(200);
    expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty("body");
  });
  it("preserves already decoded Next route parameters with literal percent sequences", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ score }));
    vi.stubGlobal("fetch", fetch);
    const response = await POST(request(), {
      params: Promise.resolve({ runId: "run/a%2Fb" }),
    });
    expect(response.status).toBe(200);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "http://api.test/v1/studio/runs/run%2Fa%252Fb/review",
    );
  });
  it("preserves permission failures without leaking upstream error details", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: "private-key" }, { status: 403 }),
        ),
    );
    const response = await studioReviewRequest(request(), "run");
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("private-key");
  });
  it("reports network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect((await studioReviewRequest(request(), "run")).status).toBe(503);
  });
});
