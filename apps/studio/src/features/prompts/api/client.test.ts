import { afterEach, describe, expect, it, vi } from "vitest";
import { STUDIO_REQUEST_PATH } from "@/lib/studio-routing";
import { PromptRequestError, promptRequest } from "./client";

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

describe("prompt save failures", () => {
  it.each([
    [409, "PROMPT_REVISION_CONFLICT", true],
    [409, "PROMPT_CONFLICT", false],
    [503, "PROMPT_REVISION_CONFLICT", false],
    [503, "SERVICE_UNAVAILABLE", false],
    [403, "FORBIDDEN", false],
  ] as const)("preserves status %s and code %s without guessing a revision conflict", async (status, code, conflict) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: code, message: "Save rejected." }, { status }),
        ),
    );
    const error = await promptRequest(
      "actions",
      { action: "draft" },
      undefined,
      "/prompts",
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(PromptRequestError);
    expect(error).toMatchObject({
      status,
      code,
      message: "Save rejected.",
      revisionConflict: conflict,
    });
  });

  it("keeps a non-JSON 503 recognizable instead of reporting a JSON parse failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("Service unavailable", { status: 503 }),
        ),
    );
    await expect(
      promptRequest("actions", { action: "draft" }, undefined, "/prompts"),
    ).rejects.toMatchObject({
      status: 503,
      revisionConflict: false,
      message: "Prompt request failed. Please try again.",
    });
  });

  it("preserves an offline failure without claiming a server-side conflict", async () => {
    const offline = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(offline));
    await expect(
      promptRequest("actions", { action: "draft" }, undefined, "/prompts"),
    ).rejects.toBe(offline);
    expect(offline).not.toBeInstanceOf(PromptRequestError);
  });
});
