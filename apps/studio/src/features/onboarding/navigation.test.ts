import { expect, it, vi } from "vitest";
import { prepareSampleTour } from "./navigation";

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
