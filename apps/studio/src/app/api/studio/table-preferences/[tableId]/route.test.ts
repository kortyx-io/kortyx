import { studioAuth } from "@studio/auth";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sampleRequestResponse } from "@/features/sample-project/server";
import { GET, POST } from "./route";

vi.mock("@/features/sample-project/server", () => ({
  sampleRequestResponse: vi.fn(async () => null),
}));
vi.mock("@studio/auth", () => ({
  studioAuth: {
    authorize: vi.fn(async () => null),
    getApiCredential: vi.fn(async () => ({
      authorization: "Bearer server-only",
      projectId: "project",
    })),
  },
}));
beforeEach(() => {
  vi.stubEnv("KORTYX_STUDIO_AUTH_MODE", "basic");
  vi.stubEnv("KORTYX_API_URL", "http://api.test");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ ok: true })),
  );
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const params = { params: Promise.resolve({ tableId: "prompts" }) };
it("rejects cross-origin mutations before forwarding credentials", async () => {
  const request = new Request(
    "http://studio.test/api/studio/table-preferences/prompts",
    {
      method: "POST",
      headers: { origin: "http://other.test", "x-kortyx-preferences": "1" },
      body: "{}",
    },
  );
  expect((await POST(request, params)).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it("forwards only server-owned credentials and project scope", async () => {
  await GET(
    new Request("http://studio.test/api/studio/table-preferences/prompts", {
      headers: {
        authorization: "Bearer attacker",
        "x-kortyx-project-id": "other",
      },
    }),
    params,
  );
  expect(fetch).toHaveBeenCalledWith(
    "http://api.test/v1/studio/table-preferences/prompts",
    expect.objectContaining({
      headers: expect.objectContaining({
        authorization: "Bearer server-only",
        "x-kortyx-project-id": "project",
      }),
      cache: "no-store",
      redirect: "error",
    }),
  );
});
it("keeps unauthenticated development mode browser-local", async () => {
  vi.stubEnv("KORTYX_STUDIO_AUTH_MODE", "none");
  expect(
    (
      await GET(
        new Request("http://studio.test/api/studio/table-preferences/prompts"),
        params,
      )
    ).status,
  ).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it("requires authorization and bounds request bodies", async () => {
  vi.mocked(studioAuth.authorize).mockResolvedValueOnce(
    new Response("denied", { status: 401 }),
  );
  expect(
    (
      await GET(
        new Request("http://studio.test/api/studio/table-preferences/prompts"),
        params,
      )
    ).status,
  ).toBe(401);
  const request = new Request(
    "http://studio.test/api/studio/table-preferences/prompts",
    {
      method: "POST",
      headers: { origin: "http://studio.test", "x-kortyx-preferences": "1" },
      body: "x".repeat(131073),
    },
  );
  expect((await POST(request, params)).status).toBe(413);
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps sample reads and writes away from real project credentials", async () => {
  for (const handler of [GET, POST]) {
    vi.mocked(sampleRequestResponse).mockResolvedValueOnce(
      new Response("sample", { status: 403 }),
    );
    expect(
      (
        await handler(
          new Request(
            "http://studio.test/api/studio/table-preferences/prompts",
          ),
          params,
        )
      ).status,
    ).toBe(403);
  }
  expect(studioAuth.getApiCredential).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
