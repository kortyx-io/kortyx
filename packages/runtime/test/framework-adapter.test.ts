import { afterEach, describe, expect, it, vi } from "vitest";

const createStore = () => ({
  get: vi.fn(async (key: string) =>
    key.includes(":hit") || key.endsWith(":") ? "cp-1" : null,
  ),
  set: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
  hset: vi.fn(async () => {}),
  hsetnx: vi.fn(async () => 1),
  hgetall: vi.fn(async () => ({})),
  expire: vi.fn(async () => {}),
  scanKeys: vi.fn(async () => []),
  delRaw: vi.fn(async () => {}),
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("../src/framework/redis/redis-store");
  vi.resetModules();
});

it("shares lifecycle methods while preserving Redis native expiry and memory cleanup limits", async () => {
  const store = { ...createStore(), close: vi.fn(async () => {}) };
  vi.doMock("../src/framework/redis/redis-store", () => ({
    createRedisFrameworkStore: () => store,
  }));
  const { createInMemoryFrameworkAdapter, createRedisFrameworkAdapter } =
    await import("../src/framework/adapter");
  const memory = createInMemoryFrameworkAdapter();
  const { maintenance: _maintenance, close: _close, ...legacy } = memory;
  const custom: import("../src/framework/adapter").FrameworkAdapter = legacy;
  expect(custom.pendingRequests).toBe(memory.pendingRequests);
  const redis = createRedisFrameworkAdapter({ url: "redis://localhost" });
  for (const adapter of [memory, redis]) {
    await adapter.maintenance.setup();
    expect(await adapter.maintenance.prune()).toMatchObject({
      skipped: false,
      hasMore: false,
      deleted: { pendingRequests: 0 },
    });
    for (const batchSize of [0, 1001, 1.5, NaN]) {
      await expect(adapter.maintenance.prune({ batchSize })).rejects.toThrow(
        TypeError,
      );
    }
    for (const now of [
      new Date(NaN),
      new Date(-1),
      new Date(Date.now() + 10000),
    ]) {
      await expect(adapter.maintenance.prune({ now })).rejects.toThrow(
        TypeError,
      );
    }
  }
  vi.useFakeTimers();
  vi.setSystemTime(100);
  const record = {
    requestId: "request",
    runId: "run",
    workflow: "workflow",
    node: "node",
    schema: { kind: "text" as const, multiple: false },
    options: [],
    createdAt: 100,
    ttlMs: 10,
  };
  await memory.pendingRequests.save({ ...record, token: "a" });
  await memory.pendingRequests.save({ ...record, token: "b" });
  await memory.pendingRequests.save({ ...record, token: "live", ttlMs: 100 });
  vi.setSystemTime(111);
  expect(
    await memory.maintenance.prune({ batchSize: 1, now: new Date(110) }),
  ).toMatchObject({ deleted: { pendingRequests: 0 }, hasMore: false });
  expect(await memory.maintenance.prune({ batchSize: 1 })).toMatchObject({
    deleted: { pendingRequests: 1 },
    hasMore: true,
  });
  expect(await memory.maintenance.prune()).toMatchObject({
    deleted: { pendingRequests: 1 },
    hasMore: false,
  });
  expect(await memory.pendingRequests.get("live")).toBeDefined();
  await memory.close();
  await redis.close();
  expect(store.close).toHaveBeenCalledOnce();
});

it("composes cache capabilities without wrapping or dropping storage methods", async () => {
  const store = { ...createStore(), close: vi.fn(async () => {}) };
  vi.doMock("../src/framework/redis/redis-store", () => ({
    createRedisFrameworkStore: () => store,
  }));
  const { createInMemoryFrameworkAdapter, createRedisFrameworkAdapter } =
    await import("../src/framework/adapter");
  const {
    createCachingFrameworkAdapter,
    registerFrameworkCacheStorage,
    validateFrameworkCacheOptions,
  } = await import("../src/framework/caching");
  const storage = Object.assign(createInMemoryFrameworkAdapter(), {
    futureMethod: async () => "preserved",
  });
  const cache = createRedisFrameworkAdapter({
    url: "redis://localhost",
    ttlMs: 1234,
    prefix: "custom:",
  });
  expect(() => createCachingFrameworkAdapter({ storage, cache })).toThrow(
    "storage must support",
  );
  let payload:
    | import("../src/framework/caching").FrameworkPayloadCache
    | undefined;
  const bind = vi.fn((value) => {
    payload = value;
  });
  registerFrameworkCacheStorage(storage, bind);
  expect(() =>
    createCachingFrameworkAdapter({ storage, cache: storage }),
  ).toThrow("cache must provide");
  for (const ttl of [0, NaN, 1.5])
    expect(() => validateFrameworkCacheOptions(ttl, 25)).toThrow();
  for (const timeoutMs of [0, NaN, 1.5, 1001])
    expect(() =>
      createCachingFrameworkAdapter({ storage, cache, timeoutMs }),
    ).toThrow();
  const result = createCachingFrameworkAdapter({ storage, cache });
  expect(result).toBe(storage);
  expect(result.pendingRequests).toBe(storage.pendingRequests);
  expect(result.sessionCheckpoints).toBe(storage.sessionCheckpoints);
  expect(result.maintenance).toBe(storage.maintenance);
  await expect(result.futureMethod()).resolves.toBe("preserved");
  expect(bind).toHaveBeenCalledWith(payload, 1234, 25);
  await payload!.get("hit");
  await payload!.set("id", "value", 1234);
  expect(store.get).toHaveBeenCalledWith("kortyx:runtime-cache:hit");
  expect(store.set).toHaveBeenCalledWith(
    "kortyx:runtime-cache:id",
    "value",
    1234,
  );
  await payload!.close!();
  expect(store.close).toHaveBeenCalledOnce();
  expect(() => createCachingFrameworkAdapter({ storage, cache })).toThrow(
    "already has",
  );
  const nextCache = createRedisFrameworkAdapter({
    url: "redis://localhost",
    ttlMs: 1234,
  });
  createCachingFrameworkAdapter({ storage, cache: nextCache, timeoutMs: 100 });
  expect(bind).toHaveBeenLastCalledWith(payload, 1234, 100);
  const noClose = createStore();
  vi.doMock("../src/framework/redis/redis-store", () => ({
    createRedisFrameworkStore: () => noClose,
  }));
  vi.resetModules();
  const { createRedisFrameworkAdapter: createLegacyRedis } = await import(
    "../src/framework/adapter"
  );
  await createLegacyRedis({ url: "redis://localhost" }).close();
});

describe("redis framework adapter", () => {
  it("uses redis env configuration and deterministically cleans checkpoint keys", async () => {
    const store = createStore();
    const createRedisFrameworkStore = vi.fn(() => store);
    vi.doMock("../src/framework/redis/redis-store", () => ({
      createRedisFrameworkStore,
    }));

    const { createFrameworkAdapterFromEnv, createRedisFrameworkAdapter } =
      await import("../src/framework/adapter");

    const adapter = createRedisFrameworkAdapter({
      url: "redis://localhost:6379",
      ttlMs: 2500,
      prefix: "custom:fw:",
    });

    expect(adapter.kind).toBe("redis");
    expect(adapter.ttlMs).toBe(2500);
    expect(createRedisFrameworkStore).toHaveBeenCalledWith({
      url: "redis://localhost:6379",
      prefix: "custom:fw:",
    });

    await adapter.cleanupRun?.("run-1", [
      "hit",
      null as unknown as string,
      "miss",
    ]);
    await adapter.cleanupRun?.("run-2", []);

    expect(store.get).toHaveBeenCalledWith("kortyx:cp:latest:run-1:hit");
    expect(store.get).toHaveBeenCalledWith("kortyx:cp:latest:run-1:miss");
    expect(store.get).toHaveBeenCalledWith("kortyx:cp:latest:run-2:");
    expect(store.del).toHaveBeenCalledWith("kortyx:cp:chk:run-1:hit:cp-1");
    expect(store.del).toHaveBeenCalledWith("kortyx:cp:wr:run-1:hit:cp-1");
    expect(store.del).toHaveBeenCalledWith("kortyx:cp:latest:run-1:hit");
    expect(store.del).toHaveBeenCalledWith("kortyx:cp:chk:run-2::cp-1");

    const envAdapter = createFrameworkAdapterFromEnv({
      KORTYX_FRAMEWORK_REDIS_URL: "redis://env",
      KORTYX_TTL_MS: "700",
    });

    expect(envAdapter.kind).toBe("redis");
    expect(envAdapter.ttlMs).toBe(700);

    const envDefaultTtlAdapter = createFrameworkAdapterFromEnv({
      REDIS_URL: "redis://env-default",
    });

    expect(envDefaultTtlAdapter.kind).toBe("redis");
    expect(envDefaultTtlAdapter.ttlMs).toBe(15 * 60 * 1000);

    const retainedAdapter = createRedisFrameworkAdapter({
      url: "redis://localhost:6379",
      maxSessionCheckpoints: 1,
    });
    expect(retainedAdapter.sessionCheckpoints).toBeDefined();
  });

  it("uses default redis prefix and ttl when options are omitted", async () => {
    const store = createStore();
    const createRedisFrameworkStore = vi.fn(() => store);
    vi.doMock("../src/framework/redis/redis-store", () => ({
      createRedisFrameworkStore,
    }));

    const { createRedisFrameworkAdapter } = await import(
      "../src/framework/adapter"
    );

    const adapter = createRedisFrameworkAdapter({
      url: "redis://localhost:6379",
    });

    expect(adapter.ttlMs).toBe(15 * 60 * 1000);
    expect(createRedisFrameworkStore).toHaveBeenCalledWith({
      url: "redis://localhost:6379",
      prefix: "kortyx:fw:",
    });
  });
});

it("selects PostgreSQL before Redis and exposes maintenance without using the application's DATABASE_URL", async () => {
  const { createFrameworkAdapterFromEnv } = await import(
    "../src/framework/adapter"
  );
  const adapter = createFrameworkAdapterFromEnv({
    KORTYX_POSTGRES_URL: "postgres://test:test@localhost/test",
  });
  expect(adapter.kind).toBe("postgres");
  if (adapter.kind !== "postgres")
    throw new Error("Expected PostgreSQL adapter");
  expect(adapter.maintenance.prune).toBeTypeOf("function");
  await adapter.close();
  const configured = createFrameworkAdapterFromEnv({
    KORTYX_POSTGRES_URL: "postgres://test:test@localhost/test",
    REDIS_URL: "redis://localhost",
    KORTYX_FRAMEWORK_TTL_MS: "1000",
  });
  expect(configured.kind).toBe("postgres");
  expect(configured.ttlMs).toBe(1000);
  if (configured.kind === "postgres") await configured.close();
  expect(
    createFrameworkAdapterFromEnv({ DATABASE_URL: "postgres://localhost/app" })
      .kind,
  ).toBe("in-memory");
});
