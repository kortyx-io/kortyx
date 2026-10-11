import { afterEach, expect, it, vi } from "vitest";
import type { StudioUsageConfig } from "./contracts";

const config: StudioUsageConfig = {
  enabled: true,
  debug: false,
  product: "oss_studio",
  version: "1.0.0",
  environment: "production",
  key: "phc_public",
  host: "https://eu.i.posthog.com",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});
it("keeps browser storage and requests untouched for opt-out and debug", async () => {
  const getItem = vi.fn();
  const setItem = vi.fn();
  const fetch = vi.fn();
  vi.stubGlobal("localStorage", { getItem, setItem });
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(console, "info").mockImplementation(() => {});
  const usage = await import("./client");
  usage.configureStudioUsage({ ...config, enabled: false });
  usage.studioFeature("studio.navigation", { resource: "runs" });
  await usage.flushStudioUsage();
  usage.configureStudioUsage({ ...config, debug: true });
  usage.studioFeature("studio.navigation", {
    resource: "runs",
    path: "secret",
  });
  await usage.flushStudioUsage();
  expect(getItem).not.toHaveBeenCalled();
  expect(setItem).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  usage.configureStudioUsage({ ...config, enabled: false });
});
it("initializes idempotently before child effects and preserves pending counts across identical bootstrap", async () => {
  const getItem = vi.fn(() => null);
  const setItem = vi.fn();
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(null, { status: 200 }),
  );
  vi.stubGlobal("localStorage", { getItem, setItem });
  vi.stubGlobal("fetch", fetch);
  const usage = await import("./client");
  usage.configureStudioUsage(config);
  usage.studioFeature("studio.navigation", { resource: "runs" });
  usage.configureStudioUsage({ ...config });
  await usage.flushStudioUsage();
  expect(fetch).toHaveBeenCalledOnce();
  expect(setItem).toHaveBeenCalledOnce();
  const payload = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
  expect(payload.batch[0].properties).toMatchObject({
    product: "oss_studio",
    identity_scope: "browser",
    count: 1,
  });
  usage.configureStudioUsage({ ...config, enabled: false });
});
it("uses a stable in-memory browser ID when local storage is blocked", async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  });
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(null, { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);
  const usage = await import("./client");
  usage.configureStudioUsage(config);
  usage.studioFeature("studio.navigation");
  await usage.flushStudioUsage();
  usage.studioFeature("studio.inspect");
  await usage.flushStudioUsage();
  const ids = fetch.mock.calls.map(
    (call) => JSON.parse(String(call[1]?.body)).batch[0].distinct_id,
  );
  expect(ids[0]).toBe(ids[1]);
  usage.configureStudioUsage({ ...config, enabled: false });
});
it("normalizes routes without emitting paths or customer identifiers", async () => {
  const { usageSurface } = await import("./client");
  expect(usageSurface("/runs/private-id")).toBe("runs");
  expect(usageSurface("/private-prefix/private-id")).toBe("other");
});
