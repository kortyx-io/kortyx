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
  vi.doUnmock("../src/framework/redis/redis-store");
  vi.resetModules();
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
