import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { getLatestDocsVersionDisplay } from "./config";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("uses a newer published version when npm responds", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ version: "99.0.0" })),
  );
  expect(await getLatestDocsVersionDisplay("sdk")).toEqual({
    label: "Latest version",
    subtitle: "v99.0.0",
  });
});

for (const stalled of ["headers", "body"]) {
  it(`falls back to the local version after 3 seconds when npm stalls on ${stalled}`, async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((delay) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), delay);
      return controller.signal;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options: RequestInit) => {
        const waitForAbort = () =>
          new Promise((_, reject) => {
            options.signal?.addEventListener("abort", () =>
              reject(options.signal?.reason),
            );
          });
        return stalled === "headers"
          ? waitForAbort()
          : Promise.resolve({ ok: true, json: waitForAbort });
      }),
    );
    let completed = false;
    const display = getLatestDocsVersionDisplay("sdk").then((value) => {
      completed = true;
      return value;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await display).toEqual({
      label: "Latest version",
      subtitle: `v${JSON.parse(readFileSync("../../packages/kortyx/package.json", "utf8")).version}`,
    });
  });
}
