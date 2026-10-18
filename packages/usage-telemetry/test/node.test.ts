import { afterEach, expect, it, vi } from "vitest";
import {
  configureUsageTelemetry,
  createNodeUsageTelemetry,
  getUsageTelemetry,
  publicUsageConfiguration,
} from "../src/node";

const context = { product: "sdk", component: "agent", version: "1.0.0" };
afterEach(() => vi.unstubAllEnvs());
it("honors runtime opt-out and keeps tests disabled by default", async () => {
  const identity = vi.fn(() => crypto.randomUUID());
  const transport = vi.fn(async () => {});
  const client = createNodeUsageTelemetry({ context, identity, transport });
  client.feature("sdk.initialize");
  await client.flush();
  expect(identity).not.toHaveBeenCalled();
  vi.stubEnv("NODE_ENV", "production");
  client.feature("sdk.initialize");
  vi.stubEnv("KORTYX_USAGE_TELEMETRY_DISABLED", "1");
  await client.flush();
  expect(transport).not.toHaveBeenCalled();
  client.dispose();
});
it("does not create identities for invalid transport configuration", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("KORTYX_USAGE_TELEMETRY_POSTHOG_KEY", "phx_personal");
  const identity = vi.fn(() => crypto.randomUUID());
  const client = createNodeUsageTelemetry({ context, identity });
  client.feature("sdk.initialize");
  await client.flush();
  expect(identity).not.toHaveBeenCalled();
  client.dispose();
});
it("allows an embedding distribution to replace an already resolved component", () => {
  const previous = getUsageTelemetry("extension_test");
  const dispose = vi.spyOn(previous, "dispose");
  const replacement = createNodeUsageTelemetry({ context });
  configureUsageTelemetry("extension_test", replacement);
  expect(getUsageTelemetry("extension_test")).toBe(replacement);
  expect(dispose).toHaveBeenCalledOnce();
  replacement.dispose();
});
it("only serializes explicit public bootstrap configuration", () => {
  vi.stubEnv("KORTYX_STUDIO_API_KEY", "private-credential");
  vi.stubEnv("KORTYX_USAGE_TELEMETRY_ID", "private-identity");
  expect(JSON.stringify(publicUsageConfiguration())).not.toContain("private");
});

it("does not expose a mistakenly configured personal PostHog token in browser bootstrap", () => {
  vi.stubEnv("KORTYX_USAGE_TELEMETRY_POSTHOG_KEY", "phx_private_token");
  expect(publicUsageConfiguration()).toMatchObject({ enabled: false, key: "" });
  expect(JSON.stringify(publicUsageConfiguration())).not.toContain(
    "phx_private_token",
  );
});

it("sanitizes unused credential-bearing configuration even when a collector is selected", () => {
  vi.stubEnv("KORTYX_USAGE_TELEMETRY_ENDPOINT", "https://collector.test/usage");
  vi.stubEnv(
    "KORTYX_USAGE_TELEMETRY_POSTHOG_HOST",
    "https://private-user:private-pass@host.test",
  );
  expect(JSON.stringify(publicUsageConfiguration())).not.toContain("private-");
});

it("keeps repeated component registration idempotent", () => {
  const client = createNodeUsageTelemetry({ context });
  const dispose = vi.spyOn(client, "dispose");
  configureUsageTelemetry("idempotent_test", client);
  configureUsageTelemetry("idempotent_test", client);
  expect(dispose).not.toHaveBeenCalled();
  client.dispose();
});
