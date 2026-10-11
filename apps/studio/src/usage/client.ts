"use client";
import {
  createCollectorTransport,
  createPostHogTransport,
  createUsageTelemetry,
  publicCatalog,
  type UsageOperation,
  type UsageTelemetry,
} from "@kortyx/usage-telemetry";
import type { StudioUsageConfig } from "./contracts";

let client: UsageTelemetry | undefined;
let signature: string | undefined;
let browserIdentity: string | undefined;
const noop: UsageOperation = { end() {}, fail() {} };
export function configureStudioUsage(
  config: StudioUsageConfig,
  extension?: UsageTelemetry,
) {
  const nextSignature = JSON.stringify(config);
  if (signature === nextSignature && (!extension || extension === client))
    return;
  signature = nextSignature;
  client?.dispose();
  client = undefined;
  if (!config.enabled) return;
  try {
    client =
      extension ??
      createUsageTelemetry({
        context: {
          product: config.product,
          component: "studio_ui",
          version: config.version,
          environment: config.environment,
          identityScope: "browser",
        },
        catalog: config.catalog ?? publicCatalog,
        debug: () => config.debug,
        inspect: (records) =>
          console.info("[kortyx:usage]", JSON.stringify(records)),
        transport: config.endpoint
          ? createCollectorTransport({ endpoint: config.endpoint })
          : createPostHogTransport({ key: config.key, host: config.host }),
        identity: () => {
          if (browserIdentity) return browserIdentity;
          try {
            const saved = localStorage.getItem("kortyx.usage.id");
            if (
              saved &&
              /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
                saved,
              )
            ) {
              browserIdentity = saved;
              return saved;
            }
          } catch {}
          const id = crypto.randomUUID();
          try {
            localStorage.setItem("kortyx.usage.id", id);
          } catch {}
          browserIdentity = id;
          return id;
        },
      });
  } catch {
    /* An invalid analytics configuration must not break Studio. */
  }
}
export function studioFeature(
  operation: string,
  properties: Record<string, unknown> = {},
) {
  client?.feature(operation, properties);
}
export function studioOperation(
  operation: string,
  properties: Record<string, unknown> = {},
) {
  return client?.start(operation, properties) ?? noop;
}
export function flushStudioUsage() {
  return client?.flush() ?? Promise.resolve();
}
export function usageSurface(path: string): string {
  const first = path.split("/").filter(Boolean)[0];
  return [
    "runs",
    "sessions",
    "interrupts",
    "workflows",
    "prompts",
    "evals",
    "settings",
  ].includes(first ?? "")
    ? (first ?? "other")
    : path === "/"
      ? "home"
      : "other";
}
