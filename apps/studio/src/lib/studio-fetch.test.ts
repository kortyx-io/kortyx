import { afterEach, expect, it, vi } from "vitest";
import { STUDIO_AUTH_FAILURE } from "../auth/session-monitor";
import { studioFetch } from "./studio-fetch";
import { STUDIO_REQUEST_PATH } from "./studio-routing";

afterEach(() => vi.unstubAllGlobals());

it.each([
  401, 403, 200,
])("checks same-origin auth failures (%s) while preserving explicit project scope", async (status) => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", {
    location: { origin: "https://studio.test", pathname: "/sample/runs" },
    dispatchEvent,
  });
  const response = new Response(null, { status });
  const fetcher = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetcher);
  expect(
    await studioFetch("/api/studio/prompts/library", {
      headers: { [STUDIO_REQUEST_PATH]: "/projects/prj_test/prompts" },
    }),
  ).toBe(response);
  expect(fetcher.mock.calls[0][1].headers.get(STUDIO_REQUEST_PATH)).toBe(
    "/projects/prj_test/prompts",
  );
  expect(dispatchEvent).toHaveBeenCalledTimes(status === 200 ? 0 : 1);
  if (status !== 200)
    expect(dispatchEvent.mock.calls[0][0].type).toBe(STUDIO_AUTH_FAILURE);
});

it("never treats an external service's denial as a Studio session failure", async () => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", {
    location: { origin: "https://studio.test" },
    dispatchEvent,
  });
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  await studioFetch("https://elsewhere.test/api/test");
  expect(dispatchEvent).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledWith(
    "https://elsewhere.test/api/test",
    undefined,
  );
});
