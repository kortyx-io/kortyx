import { expect, it, vi } from "vitest";
import {
  configureUsageTelemetry,
  createNodeUsageTelemetry,
  flushUsageTelemetry,
  getUsageTelemetry,
  publicUsageConfiguration,
  runtimeUsageContext,
  usageDisabled,
} from "../src/browser-node";
import { createUsageTelemetry } from "../src/client";

it("keeps portable library exports inert until an embedding integration explicitly registers a browser client", async () => {
  const identity = vi.fn(() => crypto.randomUUID());
  const transport = vi.fn(async () => {});
  const disabled = createNodeUsageTelemetry({
    context: { product: "sdk", component: "prompts", version: "1.0.0" },
    identity,
    transport,
  });
  disabled.start("sdk.prompt.resolve").end();
  await disabled.flush();
  expect(identity).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
  disabled.dispose();
  expect(usageDisabled()).toBe(true);
  expect(publicUsageConfiguration().enabled).toBe(false);
  const original = getUsageTelemetry("browser_fixture");
  expect(getUsageTelemetry("browser_fixture")).toBe(original);
  const configured = createUsageTelemetry({
    context: { product: "sdk", component: "prompts", version: "1.0.0" },
    identity,
    transport,
  });
  configureUsageTelemetry("browser_fixture", configured);
  configureUsageTelemetry("browser_fixture", configured);
  getUsageTelemetry("browser_fixture").start("sdk.prompt.resolve").end();
  await flushUsageTelemetry();
  expect(runtimeUsageContext()).toEqual({
    runtimeMode: "unknown",
    trafficSource: "unknown",
  });
  expect(transport).toHaveBeenCalledOnce();
  configured.dispose();
});
