import { afterEach, expect, it, vi } from "vitest";
import { monitorStudioSession, STUDIO_AUTH_FAILURE } from "./session-monitor";

afterEach(() => vi.useRealTimers());

function browser() {
  const events = new EventTarget();
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  });
  return Object.assign(events, {
    document,
    location: {
      pathname: "/sample/prompts",
      search: "?q=test",
      reload: vi.fn(),
    },
    fetch: vi
      .fn()
      .mockImplementation(async () => Response.json({ reauthenticate: false })),
    setInterval,
    clearInterval,
  });
}

it("redirects an idle signed-in tab without a click, retaining the document URL", async () => {
  vi.useFakeTimers();
  const tab = browser();
  const stop = monitorStudioSession(tab as unknown as Window);
  await vi.advanceTimersByTimeAsync(0);
  tab.fetch.mockResolvedValue(Response.json({ reauthenticate: true }));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(tab.location.reload).toHaveBeenCalledTimes(1);
  expect(tab.fetch.mock.calls[0]).toMatchObject([
    "/api/studio/session",
    {
      headers: { "x-kortyx-studio-request-path": "/sample/prompts?q=test" },
      cache: "no-store",
      redirect: "error",
    },
  ]);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(tab.location.reload).toHaveBeenCalledTimes(1);
  stop();
});

it("keeps checking and redirects while another tab is active", async () => {
  vi.useFakeTimers();
  const tab = browser();
  tab.document.visibilityState = "hidden";
  const stop = monitorStudioSession(tab as unknown as Window);
  await vi.advanceTimersByTimeAsync(0);
  tab.fetch.mockResolvedValue(Response.json({ reauthenticate: true }));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(tab.location.reload).toHaveBeenCalledTimes(1);
  expect(tab.document.visibilityState).toBe("hidden");
  stop();
});

it.each([
  "focus",
  "online",
  "resume",
  "pageshow",
  "visibilitychange",
  STUDIO_AUTH_FAILURE,
])("checks expiry on %s and cleans up listeners", async (event) => {
  vi.useFakeTimers();
  const tab = browser();
  const stop = monitorStudioSession(tab as unknown as Window);
  await vi.advanceTimersByTimeAsync(0);
  tab.fetch.mockResolvedValue(Response.json({ reauthenticate: true }));
  (["visibilitychange", "resume"].includes(event)
    ? tab.document
    : tab
  ).dispatchEvent(
    Object.assign(new Event(event), { persisted: event === "pageshow" }),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(tab.location.reload).toHaveBeenCalledTimes(1);
  stop();
  expect(vi.getTimerCount()).toBe(0);
  const count = tab.fetch.mock.calls.length;
  tab.dispatchEvent(new Event(event));
  tab.document.dispatchEvent(new Event(event));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(tab.fetch).toHaveBeenCalledTimes(count);
});

it("rechecks a resumed tab even before it becomes visible", async () => {
  vi.useFakeTimers();
  const tab = browser();
  tab.document.visibilityState = "hidden";
  const stop = monitorStudioSession(tab as unknown as Window);
  await vi.advanceTimersByTimeAsync(0);
  tab.fetch.mockResolvedValue(Response.json({ reauthenticate: true }));
  tab.document.dispatchEvent(new Event("resume"));
  await vi.advanceTimersByTimeAsync(0);
  expect(tab.location.reload).toHaveBeenCalledTimes(1);
  stop();
});

it("keeps permission denials and network failures on the page", async () => {
  vi.useFakeTimers();
  const tab = browser();
  const stop = monitorStudioSession(tab as unknown as Window);
  await vi.advanceTimersByTimeAsync(0);
  tab.fetch.mockRejectedValueOnce(new TypeError("offline"));
  tab.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(0);
  tab.dispatchEvent(new Event(STUDIO_AUTH_FAILURE));
  await vi.advanceTimersByTimeAsync(0);
  expect(tab.location.reload).not.toHaveBeenCalled();
  stop();
  const count = tab.fetch.mock.calls.length;
  tab.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(120_000);
  expect(tab.fetch).toHaveBeenCalledTimes(count);
});

it("deduplicates checks and ignores expiry after unmount", async () => {
  vi.useFakeTimers();
  const tab = browser();
  let resolve!: (response: Response) => void;
  tab.fetch.mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const stop = monitorStudioSession(tab as unknown as Window);
  tab.dispatchEvent(new Event("focus"));
  tab.dispatchEvent(new Event(STUDIO_AUTH_FAILURE));
  expect(tab.fetch).toHaveBeenCalledTimes(1);
  stop();
  resolve(Response.json({ reauthenticate: true }));
  await vi.advanceTimersByTimeAsync(0);
  expect(tab.location.reload).not.toHaveBeenCalled();
});
