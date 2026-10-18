import { randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createUsageTelemetry,
  type UsageContext,
  type UsageOptions,
  type UsageTelemetry,
} from "./client";
import { RELEASE_POSTHOG_HOST, RELEASE_POSTHOG_KEY } from "./release";
import { createCollectorTransport, createPostHogTransport } from "./transport";

export { scale } from "./catalog";
export { createUsageTelemetry, type UsageTelemetry } from "./client";

type InstallationIdentity = { id: string; scope: "installation" | "process" };
let identity: Promise<InstallationIdentity> | undefined;
async function installationIdentity(): Promise<InstallationIdentity> {
  const supplied = process.env.KORTYX_USAGE_TELEMETRY_ID;
  if (
    supplied &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      supplied,
    )
  )
    return { id: supplied, scope: "installation" };
  identity ??= (async () => {
    const directory = join(homedir(), ".config", "kortyx");
    const file = join(directory, "usage-id");
    try {
      const existing = (await readFile(file, "utf8")).trim();
      if (
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          existing,
        )
      )
        return { id: existing, scope: "installation" };
    } catch {
      /* Read-only and ephemeral hosts use a process identity. */
    }
    const candidate = randomUUID();
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const handle = await open(file, "wx", 0o600);
      try {
        await handle.writeFile(candidate);
      } finally {
        await handle.close();
      }
      return { id: candidate, scope: "installation" };
    } catch {
      try {
        const winner = (await readFile(file, "utf8")).trim();
        if (
          /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
            winner,
          )
        )
          return { id: winner, scope: "installation" };
      } catch {}
      return { id: candidate, scope: "process" };
    }
  })();
  return identity;
}

/** Deliberate operator labels; unknown does not mean an external customer. */
export function runtimeUsageContext(): Required<
  Pick<UsageContext, "runtimeMode" | "trafficSource">
> {
  const traffic = process.env.KORTYX_USAGE_TELEMETRY_TRAFFIC_SOURCE;
  return {
    runtimeMode:
      process.env.CI && !["0", "false"].includes(process.env.CI.toLowerCase())
        ? ("ci" as const)
        : process.env.NODE_ENV === "production"
          ? ("production" as const)
          : process.env.NODE_ENV === "development"
            ? ("development" as const)
            : ("unknown" as const),
    trafficSource:
      traffic === "internal" ||
      traffic === "synthetic" ||
      traffic === "external"
        ? traffic
        : ("unknown" as const),
  };
}

export function usageDisabled(): boolean {
  return (
    ["1", "true"].includes(process.env.KORTYX_USAGE_TELEMETRY_DISABLED ?? "") ||
    process.env.NODE_ENV === "test"
  );
}
export function createNodeUsageTelemetry(
  options: Pick<UsageOptions, "context"> &
    Partial<Omit<UsageOptions, "context">>,
): UsageTelemetry {
  const env = process.env;
  let transport = options.transport;
  let valid = true;
  if (!transport) {
    try {
      transport = env.KORTYX_USAGE_TELEMETRY_ENDPOINT
        ? createCollectorTransport({
            endpoint: env.KORTYX_USAGE_TELEMETRY_ENDPOINT,
          })
        : createPostHogTransport({
            key: env.KORTYX_USAGE_TELEMETRY_POSTHOG_KEY || RELEASE_POSTHOG_KEY,
            host:
              env.KORTYX_USAGE_TELEMETRY_POSTHOG_HOST || RELEASE_POSTHOG_HOST,
          });
    } catch {
      valid = false;
      transport = async () => {};
    }
  }
  return createUsageTelemetry({
    ...options,
    context: {
      ...options.context,
      runtimeMode:
        options.context.runtimeMode ?? runtimeUsageContext().runtimeMode,
      trafficSource:
        options.context.trafficSource ?? runtimeUsageContext().trafficSource,
    },
    transport,
    identity: options.identity ?? installationIdentity,
    enabled: () => valid && !usageDisabled() && (options.enabled?.() ?? true),
    debug: () =>
      env.KORTYX_USAGE_TELEMETRY_DEBUG === "1" || (options.debug?.() ?? false),
    inspect:
      options.inspect ??
      ((records) => console.error("[kortyx:usage]", JSON.stringify(records))),
  });
}

const clients = new Map<string, UsageTelemetry>();
/** Flush registered component replacements without adding another emitter. */
export async function flushUsageTelemetry(): Promise<void> {
  await Promise.all([...clients.values()].map((client) => client.flush()));
}

/** Override a component client in another distribution or in an embedding application. */
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
      context: {
        product,
        component,
        version,
        environment:
          process.env.KORTYX_USAGE_TELEMETRY_ENVIRONMENT === "staging"
            ? "staging"
            : "production",
        ...runtimeUsageContext(),
      },
    });
    clients.set(component, client);
  }
  return client;
}

/** Safe browser bootstrap: capture keys are public; no identity or secrets are returned. */
export function publicUsageConfiguration() {
  const key =
    process.env.KORTYX_USAGE_TELEMETRY_POSTHOG_KEY || RELEASE_POSTHOG_KEY;
  const host =
    process.env.KORTYX_USAGE_TELEMETRY_POSTHOG_HOST || RELEASE_POSTHOG_HOST;
  const endpoint = process.env.KORTYX_USAGE_TELEMETRY_ENDPOINT;
  let publicHost = RELEASE_POSTHOG_HOST;
  try {
    createPostHogTransport({ key: RELEASE_POSTHOG_KEY, host });
    publicHost = host;
  } catch {}
  let valid = true;
  try {
    if (endpoint) createCollectorTransport({ endpoint });
    else createPostHogTransport({ key, host });
  } catch {
    valid = false;
  }
  return {
    enabled: valid && !usageDisabled(),
    ...runtimeUsageContext(),
    debug: process.env.KORTYX_USAGE_TELEMETRY_DEBUG === "1",
    environment:
      process.env.KORTYX_USAGE_TELEMETRY_ENVIRONMENT === "staging"
        ? ("staging" as const)
        : ("production" as const),
    // A mistakenly supplied personal token or credential-bearing URL must never reach HTML.
    key: valid && /^phc_[a-zA-Z0-9]+$/.test(key) ? key : "",
    host: publicHost,
    ...(valid && endpoint ? { endpoint } : {}),
  };
}
