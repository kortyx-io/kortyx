import { afterEach, describe, expect, it, vi } from "vitest";
import { STUDIO_REQUEST_PATH } from "@/lib/studio-routing";
import { promptRequest } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("prompt request scope", () => {
  it("keeps a cached read bound to its project after navigation changes the browser scope", async () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://studio.test",
        pathname: "/projects/project-b/prompts",
      },
    });
    const fetch = vi.fn().mockResolvedValue(Response.json({ assets: [] }));
    vi.stubGlobal("fetch", fetch);
    await promptRequest(
      "library",
      undefined,
      undefined,
      "/projects/project-a/prompts",
    );
    const headers = new Headers(fetch.mock.calls[0]![1].headers);
    expect(headers.get(STUDIO_REQUEST_PATH)).toBe(
      "/projects/project-a/prompts",
    );
  });

  it("keeps interactive mutations scoped to the current route and surfaces API failures", async () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://studio.test",
        pathname: "/projects/project-b/prompts",
      },
    });
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: "Assignment changed." }, { status: 409 }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      promptRequest("actions", { action: "promote" }),
    ).rejects.toThrow("Assignment changed.");
    const headers = new Headers(fetch.mock.calls[0]![1].headers);
    expect(headers.get(STUDIO_REQUEST_PATH)).toBe(
      "/projects/project-b/prompts",
    );
  });
});
