# @kortyx/telemetry

`@kortyx/telemetry` is the optional HTTP telemetry adapter for Kortyx Studio.
It is separate from the framework entry package, so applications that do not
send Studio telemetry do not include its HTTP transport.

```ts
import { createAgent } from "kortyx";
import { createKortyxTelemetryAdapter } from "@kortyx/telemetry";

const telemetry = createKortyxTelemetryAdapter({
  endpoint: process.env.KORTYX_TELEMETRY_ENDPOINT!,
  apiKey: process.env.KORTYX_TELEMETRY_API_KEY!,
  environment: "production",
  service: { name: "support-agent" },
});

const agent = createAgent({
  // ...workflow configuration
  telemetry,
});
```

`@kortyx/otel` is a separate optional adapter for OpenTelemetry. Applications
choose the adapter appropriate to their telemetry destination; `kortyx` itself
does not provide an HTTP telemetry transport.

## Privacy

Prompt, input, and output content is excluded by default. Enable only the
content sides your application is allowed to export:

```ts
createKortyxTelemetryAdapter({
  // ...connection and service options
  captureContent: { input: true, output: false },
});
```

Telemetry metadata, tags, operation names, prompt identity (name, version,
type, source), and trusted `userId`/`tenantId` trace attributes remain
available without enabling content capture.

## Delivery and lifecycle signals

Delivery is best-effort and at-least-once while the process remains alive. The
adapter batches events, retries transient failures, and exposes `flush()` for
controlled shutdown. It has no durable outbox; applications that need durable
delivery must own that outbox themselves. Telemetry failures never fail a
workflow execution.

`interrupt.expired` is intentionally API-derived from the durable `expiresAt`
included with `interrupt.created`. The SDK does not use an unreliable local TTL
timer.

`run.cancelled` is reserved until Kortyx exposes a real SDK cancellation
operation. A client disconnect is not a cancellation.
