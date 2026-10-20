import { afterEach, expect, it, vi } from "vitest";

const { end, fail, feature, operation, send } = vi.hoisted(() => {
  const end = vi.fn();
  const fail = vi.fn();
  return {
    end,
    fail,
    feature: vi.fn(),
    operation: vi.fn(() => ({ end, fail })),
    send: vi.fn(),
  };
});
vi.mock("@/usage/client", () => ({
  studioOperation: operation,
  studioFeature: feature,
}));
vi.mock("@/lib/studio-fetch", () => ({ studioFetch: send }));

import { evalRequest } from "./client";

afterEach(() => vi.clearAllMocks());
it("explains proxy outages without exposing an HTML body as a JSON parsing error", async () => {
  send.mockResolvedValueOnce(
    new Response("<html>Bad Gateway</html>", { status: 502 }),
  );
  await expect(evalRequest("runs/id/live")).rejects.toThrow("HTTP 502");
  expect(end).toHaveBeenCalledWith("failed", {
    phase: "http",
    http_status: "502",
  });
});
it("records launch settings presence without values, target IDs, suites or customer content", async () => {
  send.mockResolvedValueOnce(Response.json({ accepted: true }));
  await evalRequest("evaluations", {
    suiteId: "private-suite",
    caseTimeoutMs: 123,
    runTimeoutMs: 456,
    judge: { id: "private-judge" },
  });
  expect(operation).toHaveBeenCalledWith("studio.eval", {
    action: "launch",
    resource: "evals",
    origin: "foreground",
    settings_override: true,
    case_timeout_override: true,
    run_timeout_override: true,
  });
  expect(end).toHaveBeenCalledOnce();
  expect(fail).not.toHaveBeenCalled();
  expect(JSON.stringify(operation.mock.calls)).not.toContain("private");
  expect(JSON.stringify(operation.mock.calls)).not.toContain("123");
});
it("separates background reads, settings saves and HTTP failures", async () => {
  send.mockResolvedValueOnce(
    Response.json({ error: "private-response" }, { status: 429 }),
  );
  await expect(evalRequest("settings")).rejects.toThrow("private-response");
  expect(operation).toHaveBeenCalledWith("studio.settings", {
    action: "view",
    resource: "evals",
    origin: "background",
  });
  expect(end).toHaveBeenCalledWith("failed", {
    phase: "http",
    http_status: "429",
  });
  expect(feature).not.toHaveBeenCalled();
  send.mockResolvedValueOnce(Response.json({}));
  await evalRequest("settings", { repetitions: 2 });
  expect(feature).toHaveBeenCalledWith("studio.settings", { action: "save" });
});
it("preserves cancellation and the original network error", async () => {
  const controller = new AbortController();
  controller.abort();
  const error = new DOMException("private", "AbortError");
  send.mockRejectedValueOnce(error);
  await expect(
    evalRequest("private-id/cancel", {}, controller.signal),
  ).rejects.toBe(error);
  expect(end).toHaveBeenCalledWith("cancelled");
  expect(fail).toHaveBeenCalledWith(error);
  expect(JSON.stringify(operation.mock.calls)).not.toContain("private-id");
});
