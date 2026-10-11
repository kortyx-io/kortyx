import type { UsageTransport } from "./client";

/** Capture keys are public. This transport never accepts a personal API token. */
export function createPostHogTransport(options: {
  key: string;
  host?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): UsageTransport {
  if (!/^phc_[a-zA-Z0-9]+$/.test(options.key))
    throw new Error("Usage telemetry requires a public PostHog capture key.");
  const host = new URL(options.host ?? "https://eu.i.posthog.com");
  if (host.username || host.password || host.search || host.hash)
    throw new Error(
      "Usage endpoint must not contain credentials or query parameters.",
    );
  if (
    host.protocol !== "https:" &&
    host.hostname !== "localhost" &&
    host.hostname !== "127.0.0.1"
  )
    throw new Error("Usage telemetry requires HTTPS.");
  return async (records, identity) => {
    const batch = records.map((record) => ({
      event: record.event,
      timestamp: record.timestamp,
      distinct_id: identity,
      uuid: record.event_id,
      properties: {
        ...record.properties,
        schema_version: record.schema_version,
        product: record.product,
        component: record.component,
        version: record.version,
        analytics_environment: record.analytics_environment,
        runtime_mode: record.runtime_mode,
        identity_scope: record.identity_scope,
        operation: record.operation,
        outcome: record.outcome,
        count: record.count,
        duration_total_ms: record.duration_total_ms,
        duration_buckets: record.duration_buckets,
        $process_person_profile: false,
        $geoip_disable: true,
        $ip: null,
      },
    }));
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 2000,
    );
    (timeout as unknown as { unref?: () => void }).unref?.();
    try {
      const response = await (options.fetch ?? globalThis.fetch)(
        new URL("/batch/", host),
        {
          method: "POST",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ api_key: options.key, batch }),
          signal: controller.signal,
        },
      );
      await response.body?.cancel();
      if (!response.ok) throw new Error("Usage delivery failed.");
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function createCollectorTransport(options: {
  endpoint: string;
  fetch?: typeof fetch;
}): UsageTransport {
  const endpoint = new URL(options.endpoint);
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new Error(
      "Usage endpoint must not contain credentials or query parameters.",
    );
  if (
    endpoint.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(endpoint.hostname)
  )
    throw new Error("Usage telemetry requires HTTPS.");
  return async (records, identity) => {
    const response = await (options.fetch ?? globalThis.fetch)(endpoint, {
      method: "POST",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identity, records }),
      signal: AbortSignal.timeout(2000),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("Usage delivery failed.");
  };
}
