// Browser fallback for libraries whose portable exports share a Node entry.
// Default-on Node collection cannot infer a browser's operator opt-out policy.
// Explicit browser bootstrap belongs to the embedding application's integration.
import {
  createUsageTelemetry,
  type UsageOptions,
  type UsageTelemetry,
} from "./client";

export { scale } from "./catalog";
export { createUsageTelemetry, type UsageTelemetry } from "./client";

const clients = new Map<string, UsageTelemetry>();
/** Flush registered component replacements without adding another emitter. */
export async function flushUsageTelemetry(): Promise<void> {
  await Promise.all([...clients.values()].map((client) => client.flush()));
}

export function createNodeUsageTelemetry(
  options: Pick<UsageOptions, "context"> &
    Partial<Omit<UsageOptions, "context">>,
): UsageTelemetry {
  return createUsageTelemetry({
    ...options,
    identity: options.identity ?? (() => ""),
    transport: options.transport ?? (async () => {}),
    enabled: () => false,
  });
}
export function configureUsageTelemetry(
  component: string,
  client: UsageTelemetry,
): void {
  if (clients.get(component) === client) return;
  clients.get(component)?.dispose();
  clients.set(component, client);
}
export function getUsageTelemetry(
  component: string,
  version = "unknown",
  product = "sdk",
): UsageTelemetry {
  let client = clients.get(component);
  if (!client) {
    client = createNodeUsageTelemetry({
      context: { component, version, product },
    });
    clients.set(component, client);
  }
  return client;
}
export function usageDisabled() {
  return true;
}
export function runtimeUsageContext() {
  return { runtimeMode: "unknown" as const, trafficSource: "unknown" as const };
}
export function publicUsageConfiguration() {
  return {
    enabled: false,
    runtimeMode: "unknown" as const,
    trafficSource: "unknown" as const,
    debug: false,
    environment: "production" as const,
    key: "",
    host: "https://eu.i.posthog.com",
  };
}
