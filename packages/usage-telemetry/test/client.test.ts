import { afterEach, describe, expect, it, vi } from "vitest";
import { publicCatalog } from "../src/catalog";
import {
  classifyUsageError,
  createUsageTelemetry,
  sanitizeProperties,
  type UsageOptions,
  type UsageRecord,
  type UsageTelemetry,
} from "../src/client";

const id = "ae037bc5-7773-42b7-9664-26328dcd121c";
const clients: UsageTelemetry[] = [];
afterEach(() => {
  for (const client of clients) client.dispose();
  vi.restoreAllMocks();
});
function fixture(overrides: Partial<UsageOptions> = {}) {
  const records: UsageRecord[] = [];
  const identity = vi.fn(() => id);
  const transport = vi.fn(async (batch: readonly UsageRecord[]) => {
    records.push(...batch);
  });
  const schedule = vi.fn(() => ({ cancel: vi.fn() }));
  const client = createUsageTelemetry({
    context: { product: "sdk", component: "agent", version: "1.2.3" },
    identity,
    transport,
    schedule,
    ...overrides,
  });
  clients.push(client);
  return { client, records, identity, transport, schedule };
}

describe("bounded usage collection", () => {
  it("aggregates the complete outcome denominator and duration histogram, ending each scope once", async () => {
    let time = 0;
    const f = fixture({ now: () => time });
    for (let i = 0; i < 9; i++) {
      const scope = f.client.start("sdk.execute");
      time += 20;
      scope.end();
      scope.fail(new Error("ignored"));
    }
    f.client.start("sdk.execute").fail({
      code: "INVALID_INPUT",
      message: "secret",
      category: "validation",
    });
    await f.client.flush();
    expect(f.records).toHaveLength(2);
    expect(f.records[0]).toMatchObject({
      count: 9,
      outcome: "success",
      duration_total_ms: 180,
      duration_buckets: [0, 9, 0, 0, 0, 0],
    });
    expect(f.records[1]).toMatchObject({
      count: 1,
      outcome: "failed",
      properties: {
        error_code: "INVALID_INPUT",
        error_category: "validation",
      },
    });
  });
  it("excludes arbitrary content and never invokes application getters", async () => {
    const getter = vi.fn(() => {
      throw new Error("secret");
    });
    const props = {
      provider: "custom-secret-provider",
      prompt: "sensitive",
      url: "https://private",
      api_key: "secret",
      message: "secret",
    };
    Object.defineProperty(props, "source", { get: getter });
    expect(sanitizeProperties(props)).toEqual({ provider: "other" });
    expect(
      classifyUsageError({
        code: "secret-app-code",
        message: "secret",
        stack: "secret",
      }),
    ).toMatchObject({
      properties: { error_code: "other", error_category: "unknown" },
    });
    const error = {};
    Object.defineProperty(error, "code", { get: getter });
    const f = fixture();
    f.client.start("sdk.model", props).fail(error);
    await f.client.flush();
    expect(getter).not.toHaveBeenCalled();
    expect(JSON.stringify(f.records)).not.toContain("secret");
  });
  it("does no identity, transport, scheduling or inspection work when disabled", async () => {
    const inspect = vi.fn();
    const f = fixture({ enabled: () => false, debug: () => true, inspect });
    f.client.feature("sdk.initialize");
    f.client.start("sdk.execute").end();
    await f.client.flush();
    expect(f.identity).not.toHaveBeenCalled();
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.schedule).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
  });
  it("rechecks opt-out after queued collection and after asynchronous identity resolution", async () => {
    let enabled = true;
    const f = fixture({ enabled: () => enabled });
    f.client.feature("sdk.initialize");
    enabled = false;
    await f.client.flush();
    expect(f.identity).not.toHaveBeenCalled();
    expect(f.client.stats().pending).toBe(0);
    let release!: (value: string) => void;
    enabled = true;
    const g = fixture({
      enabled: () => enabled,
      identity: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    g.client.feature("sdk.initialize");
    const flush = g.client.flush();
    enabled = false;
    release(id);
    await flush;
    expect(g.transport).not.toHaveBeenCalled();
  });
  it("debug inspects approved records without creating identities or sending events", async () => {
    const inspect = vi.fn();
    const f = fixture({ debug: () => true, inspect });
    f.client.feature("sdk.initialize", { prompts: true, content: "secret" });
    await f.client.flush();
    expect(inspect).toHaveBeenCalledOnce();
    expect(f.identity).not.toHaveBeenCalled();
    expect(f.transport).not.toHaveBeenCalled();
    expect(JSON.stringify(inspect.mock.calls)).not.toContain("secret");
  });
  it("bounds cardinality and hourly delivery, resetting the budget in the next hour", async () => {
    let time = 0;
    const f = fixture({ maxGroups: 2, maxRecordsPerHour: 1, now: () => time });
    f.client.feature("sdk.initialize");
    f.client.feature("sdk.model");
    f.client.feature("sdk.tool");
    await f.client.flush();
    expect(f.records).toHaveLength(1);
    expect(f.client.stats().dropped).toBe(2);
    f.client.feature("sdk.initialize");
    await f.client.flush();
    expect(f.records).toHaveLength(1);
    time = 3_600_000;
    f.client.feature("sdk.initialize");
    await f.client.flush();
    expect(f.records).toHaveLength(2);
  });
  it("serializes delivery and retains facts collected during an in-flight batch", async () => {
    let release!: () => void;
    const transport = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const f = fixture({ transport });
    f.client.feature("sdk.initialize");
    const one = f.client.flush();
    await Promise.resolve();
    f.client.feature("sdk.model");
    const two = f.client.flush();
    release();
    await Promise.all([one, two]);
    expect(transport).toHaveBeenCalledOnce();
    expect(f.client.stats().pending).toBe(1);
    const three = f.client.flush();
    await Promise.resolve();
    release();
    await three;
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("preserves product results and the original rejection when delivery fails", async () => {
    const f = fixture({
      transport: async () => {
        throw new Error("offline");
      },
    });
    const value = { secret: "result" };
    const error = new Error("original");
    expect(await f.client.measure("sdk.execute", () => value)).toBe(value);
    await expect(
      f.client.measure("sdk.execute", () => {
        throw error;
      }),
    ).rejects.toBe(error);
    await expect(f.client.flush()).resolves.toBeUndefined();
    expect(f.client.stats().dropped).toBe(2);
  });
  it("rejects unregistered product facts and supports a private extension catalog", async () => {
    const rejected = fixture({
      context: {
        product: "edition_studio",
        component: "studio_api",
        version: "1.0.0",
      },
    });
    rejected.client.feature("sdk.initialize");
    await rejected.client.flush();
    expect(rejected.transport).not.toHaveBeenCalled();
    const accepted = fixture({
      context: {
        product: "edition_studio",
        component: "studio_api",
        version: "1.0.0",
      },
      catalog: {
        ...publicCatalog,
        products: [...publicCatalog.products, "edition_studio"],
        operations: [...publicCatalog.operations, "edition.invite"],
        properties: { ...publicCatalog.properties, role: ["member", "admin"] },
      },
    });
    accepted.client.feature("edition.invite", {
      role: "member",
      email: "private",
    });
    await accepted.client.flush();
    expect(accepted.records[0]).toMatchObject({
      product: "edition_studio",
      properties: { role: "member" },
    });
  });
  it("classifies controlled outcomes without confusing interruption with failure", () => {
    expect(classifyUsageError({ name: "AbortError" }).outcome).toBe(
      "cancelled",
    );
    expect(
      classifyUsageError({ code: "EXECUTION_LIMIT_REACHED" }).outcome,
    ).toBe("limit_reached");
    expect(classifyUsageError({ name: "GraphInterrupt" }).outcome).toBe(
      "suspended",
    );
  });
});
