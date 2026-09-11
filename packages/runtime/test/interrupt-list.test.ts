import { expect, it } from "vitest";
import { createInMemoryPendingRequestStore } from "../src/framework/pending-requests";

it("lists independent snapshots of pending execution state", async () => {
  const store = createInMemoryPendingRequestStore();
  await store.save({
    token: "t",
    requestId: "i",
    runId: "r",
    workflow: "w",
    node: "n",
    schema: { kind: "text", multiple: false },
    options: [],
    createdAt: Date.now(),
    ttlMs: 1000,
  });
  const rows = await store.list!();
  rows[0]!.schema.question = "mutated";
  expect((await store.list!())[0]!.schema.question).toBeUndefined();
});
