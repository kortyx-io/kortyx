import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  after: vi.fn(),
  flush: vi.fn(),
  streamChat: vi.fn(),
  listInterrupts: vi.fn(),
  getInterrupt: vi.fn(),
  resume: vi.fn(),
  telemetryEnabled: true,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.get, set: mocks.set }),
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/kortyx-client", () => ({ agent: mocks }));
vi.mock("@/lib/telemetry", () => ({
  get telemetry() {
    return mocks.telemetryEnabled ? { flush: mocks.flush } : undefined;
  },
}));

import {
  GET as list,
  POST as resolve,
} from "../src/app/api/background/interrupts/route";
import { POST as start } from "../src/app/api/background/route";

const request = (body: unknown) =>
  new Request("http://localhost/api/background/interrupts", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.telemetryEnabled = true;
  mocks.get.mockReturnValue({ value: "authorized-session" });
  mocks.getInterrupt.mockResolvedValue({
    workflow: "background-review",
    resume: { token: "private" },
  });
  mocks.resume.mockResolvedValue({
    status: "completed",
    runId: "run",
    resume: { token: "private" },
  });
});

it("lists only background interrupts in the server cookie's scope", async () => {
  mocks.listInterrupts.mockResolvedValue([{ id: "public" }]);
  expect(await (await list()).json()).toEqual({
    interrupts: [{ id: "public" }],
  });
  expect(mocks.listInterrupts).toHaveBeenCalledWith({
    sessionId: "authorized-session",
    afterResponseCompleted: true,
  });
  mocks.get.mockReturnValue(undefined);
  expect(await (await list()).json()).toEqual({ interrupts: [] });
  expect(mocks.listInterrupts).toHaveBeenCalledOnce();
});

it("rejects missing session, malformed input, and out-of-scope IDs before resume", async () => {
  mocks.get.mockReturnValue(undefined);
  expect((await resolve(request({ id: "i", decision: "save" }))).status).toBe(
    401,
  );
  mocks.get.mockReturnValue({ value: "authorized-session" });
  expect(
    (await resolve(request({ id: "i", decision: "arbitrary" }))).status,
  ).toBe(400);
  expect(
    (
      await resolve(
        new Request("http://localhost", { method: "POST", body: "{" }),
      )
    ).status,
  ).toBe(400);
  mocks.getInterrupt.mockResolvedValue(null);
  expect(
    (await resolve(request({ id: "foreign", decision: "save" }))).status,
  ).toBe(404);
  expect(mocks.getInterrupt).toHaveBeenCalledWith("foreign", {
    sessionId: "authorized-session",
  });
  expect(mocks.resume).not.toHaveBeenCalled();
});

it.each([
  "save",
  "skip",
])("resolves %s with a private server handle and returns only public outcome", async (decision) => {
  const req = request({
    id: "public",
    decision,
    sessionId: "attacker-supplied",
  });
  const response = await resolve(req);
  const body = await response.json();
  expect(body).toEqual({
    status: "completed",
    runId: "run",
    message:
      decision === "save"
        ? "Review approved. Background workflow completed."
        : "Review skipped. Background workflow completed.",
  });
  expect(mocks.resume).toHaveBeenCalledWith({
    workflow: "background-review",
    resume: { token: "private" },
    response: { type: "select", ids: [decision] },
    abortSignal: req.signal,
  });
  expect(mocks.getInterrupt).toHaveBeenCalledWith("public", {
    sessionId: "authorized-session",
  });
  expect(mocks.flush).toHaveBeenCalledOnce();
});

it("does not report completion for another suspension, and works without Studio", async () => {
  mocks.telemetryEnabled = false;
  mocks.resume.mockResolvedValue({
    status: "suspended",
    runId: "run",
    resume: { token: "private" },
  });
  expect(
    await (await resolve(request({ id: "i", decision: "skip" }))).json(),
  ).toEqual({ status: "suspended", runId: "run" });
  expect(mocks.flush).not.toHaveBeenCalled();
});

it.each([
  new Error("Already resumed"),
  "Expired",
])("handles stale answers (%s)", async (error) => {
  mocks.resume.mockRejectedValue(error);
  const response = await resolve(request({ id: "i", decision: "save" }));
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: error instanceof Error ? error.message : error,
  });
});

it.each([
  true,
  false,
])("registers host lifetime and returns SSE, telemetry enabled=%s", async (enabled) => {
  mocks.telemetryEnabled = enabled;
  if (!enabled) mocks.get.mockReturnValue(undefined);
  mocks.streamChat.mockImplementation(async (_messages, options) => {
    options.onExecution(Promise.resolve());
    return (async function* () {
      yield { type: "done" };
    })();
  });
  const response = await start(
    new Request("http://localhost/api/background", { method: "POST" }),
  );
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(await response.text()).toContain('"type":"done"');
  expect(mocks.set).toHaveBeenCalledWith(
    "background-demo-session",
    enabled ? "authorized-session" : expect.stringMatching(/^demo-/),
    expect.objectContaining({ httpOnly: true, sameSite: "strict" }),
  );
  await mocks.after.mock.calls[0]![0]();
  expect(mocks.flush).toHaveBeenCalledTimes(enabled ? 1 : 0);
});
