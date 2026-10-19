import { describe, expect, it, vi } from "vitest";
import { STUDIO_REQUEST_PATH } from "../lib/studio-routing";
import type { StudioAuthAdapter } from "./contracts";
import { checkStudioSession } from "./session";

const request = (path: string) =>
  new Request("https://studio.test/api/studio/session", {
    headers: {
      [STUDIO_REQUEST_PATH]: path,
      cookie: "session=private",
      accept: "*/*",
    },
  });

describe("document session checks", () => {
  it.each([
    ["authenticated", false],
    ["unauthenticated", true],
  ] as const)("reports %s without starting login", async (status, expected) => {
    const authorize = vi.fn();
    const getSessionStatus = vi.fn().mockResolvedValue(status);
    const auth = {
      authorize,
      getSessionStatus,
    } as unknown as StudioAuthAdapter;
    const input = request("/sample/prompts?category=root");
    const response = await checkStudioSession(input, auth);
    expect(await response.json()).toEqual({ reauthenticate: expected });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getSessionStatus).toHaveBeenCalledWith(input);
    expect(authorize).not.toHaveBeenCalled();
    expect(input.headers.get("accept")).toBe("*/*");
  });

  it.each([
    "unsupported",
    "unavailable",
    "error",
  ])("does not redirect when session inspection is %s", async (mode) => {
    const authorize = vi.fn();
    const auth = {
      authorize,
      ...(mode === "unsupported"
        ? {}
        : {
            getSessionStatus:
              mode === "error"
                ? vi.fn().mockRejectedValue(new Error("offline"))
                : vi.fn().mockResolvedValue("unavailable"),
          }),
    } as unknown as StudioAuthAdapter;
    const response = await checkStudioSession(request("/sample/prompts"), auth);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(authorize).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "//evil.test/",
    "/\\evil.test/",
    "/api/studio/session",
    "/auth/login",
    "/runs/../auth/login",
  ])("rejects invalid document target %s", async (path) => {
    const authorize = vi.fn();
    const response = await checkStudioSession(request(path), {
      authorize,
    } as unknown as StudioAuthAdapter);
    expect(response.status).toBe(400);
    expect(authorize).not.toHaveBeenCalled();
  });
});
