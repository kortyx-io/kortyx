import {
  createInMemoryPendingRequestStore,
  type PendingRequestRecord,
} from "@kortyx/runtime";
import { expect, it } from "vitest";
import { createInterruptDiscovery } from "../src/interrupt/discovery";

const record = (
  patch: Partial<PendingRequestRecord> = {},
): PendingRequestRecord => ({
  requestId: "a",
  token: "private",
  runId: "run",
  sessionId: "session",
  workflow: "root",
  node: "review",
  schema: { kind: "text", multiple: false, meta: { __kortyxSecret: true } },
  options: [
    {
      id: "yes",
      label: "Yes",
      description: "Proceed",
      value: { private: true },
    },
  ],
  createdAt: Date.now(),
  ttlMs: 10000,
  ...patch,
});

it("filters scope, readiness, expiry and response state; returns sanitized snapshots and private lookup", async () => {
  const store = createInMemoryPendingRequestStore();
  const api = createInterruptDiscovery(store);
  const first = record();
  await store.save(first);
  await store.save(
    record({ requestId: "b", token: "b", createdAt: first.createdAt }),
  );
  await store.save(
    record({
      requestId: "c",
      token: "c",
      createdAt: first.createdAt + 1,
      responseCompleted: true,
    }),
  );
  await store.save(
    record({ requestId: "not-ready", token: "not-ready", ready: false }),
  );
  await store.save(
    record({ requestId: "expired", token: "expired", createdAt: 0 }),
  );
  const list = await api.listInterrupts({
    runId: "run",
    status: "pending",
    afterResponseCompleted: false,
  });
  expect(list.map((r) => r.id)).toEqual(["a", "b"]);
  expect(list[0]!.input).toEqual({
    kind: "text",
    multiple: false,
    options: [{ id: "yes", label: "Yes", description: "Proceed" }],
  });
  expect(await api.listInterrupts({ runId: "other" })).toEqual([]);
  expect(await api.getInterrupt("a", { sessionId: "other" })).toBeNull();
  expect(
    await api.getInterrupt("missing", { sessionId: "session" }),
  ).toBeNull();
  expect(await api.getInterrupt("a", { runId: "run" })).toMatchObject({
    resume: { token: "private" },
  });
  await store.save(
    record({
      requestId: "no-session",
      token: "none",
      sessionId: undefined,
      options: [],
    }),
  );
  expect(await api.getInterrupt("no-session", { runId: "run" })).toMatchObject({
    sessionId: "",
    resume: { sessionId: "" },
  });
  await expect(api.listInterrupts({})).rejects.toThrow("scope");
  await expect(
    api.listInterrupts({ sessionId: "session", status: "resolved" } as never),
  ).rejects.toThrow();
  await expect(api.getInterrupt("", { runId: "run" })).rejects.toThrow();
});

it("rejects unsupported adapters, excludes records that expire during listing", async () => {
  const store = createInMemoryPendingRequestStore();
  await expect(
    createInterruptDiscovery({
      save: store.save,
      get: store.get,
      delete: store.delete,
      update: store.update,
    }).listInterrupts({
      runId: "r",
    }),
  ).rejects.toThrow("does not support");
  const api = createInterruptDiscovery({
    ...store,
    list: async () => [record({ createdAt: 0 })],
  });
  expect(await api.listInterrupts({ runId: "run" })).toEqual([]);
});
