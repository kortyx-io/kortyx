import { expect, it, vi } from "vitest";
import { prepareSamplePage, prepareSampleTour } from "./navigation";

it("shows a hidden sample only as part of the explicitly chosen start action", async () => {
  const request = vi.fn<typeof fetch>(async () => new Response("{}"));
  const result = await prepareSampleTour(
    {
      action: "chapter",
      chapter: "approvals",
      visible: false,
      returnTo: "/projects/prj_0123456789abcdef01234567/runs",
    },
    request,
  );
  expect(
    request.mock.calls.map(([, options]) => JSON.parse(String(options?.body))),
  ).toEqual([
    { action: "visibility", visible: true },
    {
      action: "enter",
      returnTo: "/projects/prj_0123456789abcdef01234567/runs",
    },
  ]);
  expect(result).toEqual({
    href: "/sample/runs?learn=chapter&chapter=approvals",
    shown: true,
  });
});
it("preserves visibility for an already-visible sample and bounds entry intent to IDs", async () => {
  const request = vi.fn<typeof fetch>(async () => new Response("{}"));
  expect(
    await prepareSampleTour(
      {
        action: "full",
        chapter: "sample-execution",
        visible: true,
        returnTo: "/runs",
      },
      request,
    ),
  ).toEqual({ href: "/sample/runs?learn=full", shown: false });
  expect(request).toHaveBeenCalledOnce();
});
it("does not navigate after failed preferences and forwards cancellation", async () => {
  const request = vi.fn<typeof fetch>(
    async () => new Response("", { status: 503 }),
  );
  const controller = new AbortController();
  await expect(
    prepareSampleTour(
      {
        action: "resume",
        chapter: "sample-execution",
        visible: false,
        returnTo: "/runs",
        signal: controller.signal,
      },
      request,
    ),
  ).rejects.toThrow("Sample unavailable");
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
});

it("does not continue entry after cancellation even if a transport resolves late", async () => {
  const controller = new AbortController();
  const request = vi.fn<typeof fetch>(async () => {
    controller.abort();
    return new Response("{}");
  });
  await expect(
    prepareSampleTour(
      {
        action: "full",
        chapter: "sample-execution",
        visible: false,
        returnTo: "/runs",
        signal: controller.signal,
      },
      request,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(request).toHaveBeenCalledOnce();
});
it("enters the corresponding sample page with an explicit page-help intent", async () => {
  const request = vi.fn<typeof fetch>(async () => new Response("{}"));
  const result = await prepareSamplePage(
    { page: "diagnostic", visible: true, returnTo: "/runs" },
    request,
  );
  expect(result.href).toMatch(
    /^\/sample\/diagnostics\/[0-9a-f-]+\?env=sample&explain=1$/,
  );
  expect(result.href).not.toContain("learn=chapter");
  expect(request).toHaveBeenCalledOnce();
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
    action: "enter",
    returnTo: "/runs",
  });
});
it("rejects pages without examples before modifying preferences", async () => {
  const request = vi.fn<typeof fetch>();
  await expect(
    prepareSamplePage(
      { page: "settings", visible: false, returnTo: "/runs" },
      request,
    ),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
