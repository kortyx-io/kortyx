import { beforeEach, expect, it, vi } from "vitest";
import type { PendingRequestRecord } from "../src/framework/pending-requests";
import { createRedisPendingRequestStore } from "../src/framework/redis/pending-request-store";
import { createRedisFrameworkStore } from "../src/framework/redis/redis-store";

const { command } = vi.hoisted(() => ({ command: vi.fn() }));
vi.mock("../src/framework/redis/redis-client", () => ({
  createRedisClient: () => ({ command }),
}));
beforeEach(() => command.mockReset());

it("enumerates only its namespace, deduplicates SCAN keys and ignores expired GETs", async () => {
  command
    .mockResolvedValueOnce([
      "9",
      ["app:kortyx:pending:a", "app:kortyx:pending:b"],
    ])
    .mockResolvedValueOnce(["0", ["app:kortyx:pending:a"]])
    .mockResolvedValueOnce('{"requestId":"a"}')
    .mockResolvedValueOnce(null);
  const store = createRedisFrameworkStore({
    url: "redis://test",
    prefix: "app:",
  });
  const pending = createRedisPendingRequestStore({ store });
  expect(await pending.list!()).toEqual([{ requestId: "a" }]);
  expect(command.mock.calls).toEqual([
    ["SCAN", ["0", "MATCH", "app:kortyx:pending:*", "COUNT", "200"]],
    ["SCAN", ["9", "MATCH", "app:kortyx:pending:*", "COUNT", "200"]],
    ["GET", ["app:kortyx:pending:a"]],
    ["GET", ["app:kortyx:pending:b"]],
  ]);
});

it("surfaces Redis read and scan failures instead of pretending nothing is waiting", async () => {
  const store = createRedisFrameworkStore({ url: "redis://test" });
  command.mockResolvedValueOnce({ type: "error", message: "denied" });
  await expect(store.list!("pending:")).rejects.toThrow(
    "Redis SCAN error: denied",
  );
  command
    .mockResolvedValueOnce(["0", ["kortyx:fw:pending:a"]])
    .mockResolvedValueOnce({ type: "error", message: "unavailable" });
  await expect(store.list!("pending:")).rejects.toThrow(
    "Redis GET error: unavailable",
  );
});

it("keeps discovery optional for legacy custom stores", () => {
  const store = createRedisFrameworkStore({ url: "redis://test" });
  delete store.list;
  expect(
    createRedisPendingRequestStore({ store, prefix: "custom:" }).list,
  ).toBeUndefined();
});
