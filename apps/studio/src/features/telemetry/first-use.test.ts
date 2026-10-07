import { beforeEach, expect, it, vi } from "vitest";

const read = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/studio-api", () => ({
  getStudioRuns: read,
  getStudioSessions: read,
  getStudioInterrupts: read,
  getStudioWorkflows: read,
}));

import { hasNoObservations, isFirstUseQuery } from "./first-use";

beforeEach(() => read.mockReset());
it("does not replace filtered, historical or paginated empty results with setup", () => {
  expect(isFirstUseQuery({ env: "production", range: "24 hours" })).toBe(true);
  for (const query of [
    { q: "missing" },
    { status: "failed" },
    { range: "7 days" },
    { cursor: "20" },
    { startedAfter: "2020-01-01" },
  ])
    expect(isFirstUseQuery(query)).toBe(false);
});
it("requires a successful all-time zero count in the requested environment", async () => {
  read.mockResolvedValue({ error: null, data: { totalCount: 0 } });
  expect(await hasNoObservations("runs", "production")).toBe(true);
  expect(read).toHaveBeenCalledWith({
    range: "All time",
    env: "production",
    pageSize: "1",
  });
  read.mockResolvedValue({ error: null, data: { totalCount: 2 } });
  expect(await hasNoObservations("runs", "production")).toBe(false);
  read.mockResolvedValue({ error: { type: "http", status: 403 }, data: null });
  expect(await hasNoObservations("sessions", undefined)).toBe(false);
});
