// @vitest-environment jsdom

import {
  emptyTablePreferences,
  type StudioTablePreferenceScope,
  type StudioTablePreferences,
} from "@kortyx/telemetry-contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTablePreferenceEntry } from "./cache";

const scope: StudioTablePreferenceScope = {
  cacheKey: "a".repeat(64),
  ownerKind: "user",
};
const query = { sort: "name", dir: "asc" as const, pageSize: 50 };
const state = (revision = 1): StudioTablePreferences => ({
  ...emptyTablePreferences(),
  revision,
  defaults: { query },
});
const response = (preferences = state(), identity = scope) =>
  Response.json({ scope: identity, preferences });
const tick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};
let entries: ReturnType<typeof createTablePreferenceEntry>[];
function entry(identity = scope, remote = true) {
  const e = createTablePreferenceEntry(identity, "prompts", remote);
  entries.push(e);
  return e;
}
beforeEach(() => {
  entries = [];
  localStorage.clear();
});
afterEach(() => {
  entries.forEach((e) => {
    e.dispose();
  });
  vi.unstubAllGlobals();
});
it("paints the scoped cache while the database read is still pending, then refreshes it", async () => {
  localStorage.setItem(
    `kortyx.table-cache.v1.${scope.cacheKey}.prompts`,
    JSON.stringify({ server: state(), pending: [] }),
  );
  let resolve!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    ),
  );
  const e = entry();
  e.start();
  expect(e.getSnapshot().preferences.defaults.query?.pageSize).toBe(50);
  expect(e.getSnapshot().status).toBe("loading");
  resolve(
    response({ ...state(2), defaults: { query: { ...query, pageSize: 100 } } }),
  );
  await tick();
  expect(e.getSnapshot().preferences.defaults.query?.pageSize).toBe(100);
  expect(e.getSnapshot().status).toBe("saved");
  expect(
    JSON.parse(
      localStorage.getItem(`kortyx.table-cache.v1.${scope.cacheKey}.prompts`) ??
        "{}",
    ).server.revision,
  ).toBe(2);
});
it("preserves edits made during the initial read and saves against the refreshed revision", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValue(
      response({
        ...state(8),
        defaults: { query: { ...query, pageSize: 20 } },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const e = entry();
  e.start();
  e.mutate({ kind: "defaults", patch: { query: { ...query, pageSize: 20 } } });
  resolve(response(state(7)));
  await tick();
  await tick();
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({
    scopeKey: scope.cacheKey,
    expectedRevision: 7,
    operation: { patch: { query: { pageSize: 20 } } },
  });
  expect(e.getSnapshot().preferences.defaults.query?.pageSize).toBe(20);
  expect(e.getSnapshot().status).toBe("saved");
});
it("keeps failed writes cached, surfaces conflicts, and only rebases after explicit retry", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValueOnce(new Response("{}", { status: 409 }))
    .mockResolvedValueOnce(response(state(5)))
    .mockResolvedValueOnce(response(state(6)));
  vi.stubGlobal("fetch", fetcher);
  const e = entry();
  e.start();
  e.mutate({ kind: "defaults", patch: { query } });
  resolve(response(state(1)));
  await tick();
  await tick();
  expect(e.getSnapshot().status).toBe("conflict");
  expect(
    JSON.parse(
      localStorage.getItem(`kortyx.table-cache.v1.${scope.cacheKey}.prompts`) ??
        "{}",
    ).pending,
  ).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  e.retry();
  await tick();
  await tick();
  expect(JSON.parse(fetcher.mock.calls[3][1].body).expectedRevision).toBe(5);
  expect(e.getSnapshot().status).toBe("saved");
});
it("does not read another owner's cache or unscoped legacy views", async () => {
  localStorage.setItem(
    `kortyx.table-cache.v1.${scope.cacheKey}.prompts`,
    JSON.stringify({ server: state(), pending: [] }),
  );
  localStorage.setItem("kortyx.table.prompts.views.v1", "[]");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  const e = entry({ ...scope, cacheKey: "b".repeat(64) });
  e.start();
  expect(e.getSnapshot().preferences).toEqual(emptyTablePreferences());
});
it("rejects responses for a changed identity and clears the old in-memory snapshot", async () => {
  localStorage.setItem(
    `kortyx.table-cache.v1.${scope.cacheKey}.prompts`,
    JSON.stringify({ server: state(), pending: [] }),
  );
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        response(state(), { ...scope, cacheKey: "b".repeat(64) }),
      ),
  );
  const e = entry();
  e.start();
  await tick();
  expect(e.getSnapshot().status).toBe("error");
  expect(e.getSnapshot().preferences).toEqual(emptyTablePreferences());
  expect(
    localStorage.getItem(`kortyx.table-cache.v1.${scope.cacheKey}.prompts`),
  ).toBeNull();
});
it("uses only local storage when database persistence is disabled", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const e = entry(scope, false);
  e.start();
  e.mutate({ kind: "defaults", patch: { query } });
  expect(e.getSnapshot().status).toBe("local");
  expect(fetcher).not.toHaveBeenCalled();
});
it("retains a usable cache when refresh fails and works when browser storage is blocked", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  localStorage.setItem(
    `kortyx.table-cache.v1.${scope.cacheKey}.prompts`,
    JSON.stringify({ server: state(), pending: [] }),
  );
  const e = entry();
  e.start();
  await tick();
  expect(e.getSnapshot().preferences.defaults.query).toEqual(query);
  expect(e.getSnapshot().status).toBe("error");
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(() => e.mutate({ kind: "defaults", patch: { query } })).not.toThrow();
  spy.mockRestore();
});
it("does not silently upload stale pending edits after a browser restart", async () => {
  localStorage.setItem(
    `kortyx.table-cache.v1.${scope.cacheKey}.prompts`,
    JSON.stringify({
      server: state(1),
      pending: [{ kind: "defaults", patch: { query } }],
    }),
  );
  const fetcher = vi.fn().mockResolvedValue(response(state(4)));
  vi.stubGlobal("fetch", fetcher);
  const e = entry();
  e.start();
  await tick();
  expect(e.getSnapshot().status).toBe("conflict");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("refreshes an existing cache entry when returning to a table", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(state(1)))
    .mockResolvedValueOnce(response(state(2)));
  vi.stubGlobal("fetch", fetcher);
  const e = entry();
  e.start();
  await tick();
  e.start();
  await tick();
  expect(e.getSnapshot().preferences.revision).toBe(2);
});
it("keeps local edits when shared project preferences are read-only", async () => {
  let resolve!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          }),
      )
      .mockResolvedValueOnce(
        Response.json({ error: "PREFERENCE_READ_ONLY" }, { status: 403 }),
      ),
  );
  const e = entry();
  e.start();
  e.mutate({ kind: "defaults", patch: { query } });
  resolve(response());
  await tick();
  await tick();
  expect(e.getSnapshot().status).toBe("error");
  expect(e.getSnapshot().error).toContain("read-only");
  expect(e.getSnapshot().preferences.defaults.query).toEqual(query);
  expect(
    JSON.parse(
      localStorage.getItem(`kortyx.table-cache.v1.${scope.cacheKey}.prompts`) ??
        "{}",
    ).pending,
  ).toHaveLength(1);
});
