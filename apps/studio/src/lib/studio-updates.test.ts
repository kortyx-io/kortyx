import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { studioUpdateRequest } from "./studio-updates";

const authorization = `Basic ${Buffer.from("admin:password").toString("base64")}`;
const status = {
  current: "0.2.0",
  available: null,
  checkedAt: null,
  checkError: null,
  operation: null,
  settings: { automatic: false, hourUtc: 0 },
};
beforeEach(() => {
  vi.stubEnv("KORTYX_STUDIO_AUTH_MODE", "basic");
  vi.stubEnv("KORTYX_STUDIO_BASIC_AUTH_USERNAME", "admin");
  vi.stubEnv("KORTYX_STUDIO_BASIC_AUTH_PASSWORD", "password");
  vi.stubEnv("KORTYX_STUDIO_UPDATER_URL", "http://updater:6410");
  vi.stubEnv("KORTYX_STUDIO_UPDATE_TOKEN", "server-only-token");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Studio update controls", () => {
  it("rejects missing authentication even if middleware is bypassed", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      (
        await studioUpdateRequest(
          new Request("http://localhost/api/studio/updates"),
        )
      ).status,
    ).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutations and unknown actions", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const request = (origin: string, action = "update") =>
      new Request("http://localhost/api/studio/updates", {
        method: "POST",
        headers: {
          authorization,
          host: "localhost",
          origin,
          "content-type": "application/json",
          "x-kortyx-update": "1",
        },
        body: JSON.stringify({ action }),
      });
    expect(
      (await studioUpdateRequest(request("https://evil.example"))).status,
    ).toBe(403);
    expect(
      (await studioUpdateRequest(request("http://localhost", "run-command")))
        .status,
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps updater credentials on the server", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(status));
    vi.stubGlobal("fetch", fetcher);
    const response = await studioUpdateRequest(
      new Request("http://localhost/api/studio/updates", {
        headers: { authorization },
      }),
    );
    expect(await response.json()).toEqual(status);
    expect(fetcher.mock.calls[0]?.[1].headers.authorization).toBe(
      "Bearer server-only-token",
    );
  });
  it("does not expose update control in unauthenticated installations", async () => {
    vi.stubEnv("KORTYX_STUDIO_AUTH_MODE", "none");
    expect(
      (
        await studioUpdateRequest(
          new Request("http://localhost/api/studio/updates", {
            headers: { authorization },
          }),
        )
      ).status,
    ).toBe(401);
  });
  it("explains update ownership when no updater is configured", async () => {
    vi.stubEnv("KORTYX_STUDIO_UPDATER_URL", "");
    vi.stubEnv("KORTYX_STUDIO_UPDATE_TOKEN", "");

    const response = await studioUpdateRequest(
      new Request("http://localhost/api/studio/updates", {
        headers: { authorization },
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error:
        "This installation does not have an in-product updater. Manage updates through your deployment workflow, or use the Kortyx installer for local Docker update management.",
    });
  });
});
