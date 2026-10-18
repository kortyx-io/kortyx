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

it("classifies scoped navigation without retaining project or organization identifiers", async () => {
  const { usageSurface } = await import("./client");
  const project = "prj_0123456789abcdef01234567";
  const organization = "org_0123456789abcdef01234567";
  for (const surface of [
    "runs",
    "sessions",
    "prompts",
    "evals",
    "workflows",
    "interrupts",
  ])
    expect(
      usageSurface(`/projects/${project}/${surface}/private-resource`),
    ).toBe(surface);
  expect(usageSurface(`/projects/${project}/settings/general`)).toBe(
    "settings",
  );
  expect(usageSurface(`/organizations/${organization}/settings/members`)).toBe(
    "settings",
  );
  expect(usageSurface("/projects/unrecognized-id/runs")).toBe("other");
});

it("measures sample exploration separately and strips sample content", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(null, { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("window", { location: { pathname: "/sample/runs" } });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  const usage = await import("./client");
  usage.configureStudioUsage(config);
  usage.studioFeature("studio.eval", { action: "launch" });
  usage.studioOperation("studio.read", { resource: "runs" }).end();
  usage.studioFeature("studio.sample", {
    sample_action: "view",
    runId: "private-id",
    content: "private-content",
  });
  await usage.flushStudioUsage();
  expect(fetch).toHaveBeenCalledOnce();
  const body = String(fetch.mock.calls[0]?.[1]?.body);
  expect(body).toContain("studio.sample");
  expect(body).not.toContain("studio.eval");
  expect(body).not.toContain("studio.read");
  expect(body).not.toContain("private-id");
  expect(body).not.toContain("private-content");
  usage.configureStudioUsage({ ...config, enabled: false });
  usage.studioFeature("studio.sample", { sample_action: "select" });
  await usage.flushStudioUsage();
  expect(fetch).toHaveBeenCalledOnce();
});

it("allowlists tour outcomes and honors opt-out without sending tour content", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(null, { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("window", { location: { pathname: "/sample/runs" } });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  const usage = await import("./client");
  usage.configureStudioUsage(config);
  const actions = ["tour_start", "tour_complete", "tour_skip", "tour_error"];
  for (const sample_action of actions)
    usage.studioFeature("studio.sample", {
      sample_action,
      title: "private-title",
      error: "private-error",
      target: "/sample/private-path",
    });
  await usage.flushStudioUsage();
  const body = String(fetch.mock.calls[0]?.[1]?.body);
  for (const action of actions) expect(body).toContain(action);
  expect(body).not.toContain("private-");
  usage.configureStudioUsage({ ...config, enabled: false });
  usage.studioFeature("studio.sample", { sample_action: "tour_start" });
  await usage.flushStudioUsage();
  expect(fetch).toHaveBeenCalledOnce();
});

it("collects finite chapter diagnostics while excluding arbitrary step names and errors", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(null, { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  const usage = await import("./client");
  usage.configureStudioUsage(config);
  usage.studioFeature("studio.sample", {
    sample_action: "tour_error",
    tour_chapter: "prompt-versions",
    tour_mode: "full",
    tour_version: "1",
    tour_step: "prompt-diff",
    tour_failure: "target",
    error: "private-error",
    href: "/private-project",
  });
  usage.studioFeature("studio.sample", {
    sample_action: "tour_error",
    tour_chapter: "private-chapter",
    tour_step: "private-step",
    tour_failure: "private-cause",
  });
  await usage.flushStudioUsage();
  const body = String(fetch.mock.calls[0]?.[1]?.body);
  expect(body).toContain("prompt-versions");
  expect(body).toContain("prompt-diff");
  expect(body).toContain('"tour_failure":"target"');
  expect(body).not.toContain("private-");
  usage.configureStudioUsage({ ...config, enabled: false });
});
