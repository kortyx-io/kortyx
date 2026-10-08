# @kortyx/telemetry

`@kortyx/telemetry` is the optional HTTP telemetry adapter for Kortyx Studio.
It is separate from the framework entry package, so applications that do not
send Studio telemetry do not include its HTTP transport.

```ts
import { createAgent } from "kortyx";
import { createKortyxTelemetryAdapter } from "@kortyx/telemetry";

const telemetry = createKortyxTelemetryAdapter({
  endpoint: process.env.KORTYX_TELEMETRY_API_URL!,
  apiKey: process.env.KORTYX_TELEMETRY_API_KEY!,
  environment:
    process.env.KORTYX_TELEMETRY_ENVIRONMENT ?? "development",
  service: {
    name: process.env.KORTYX_TELEMETRY_SERVICE_NAME ?? "support-agent",
  },
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
controlled shutdown. Ordinary events have no durable outbox; applications that
need durable event delivery must own that outbox themselves. Complete diagnostics
have a separate opt-in upload queue and optional Node spool. Telemetry failures never fail a
workflow execution.

`interrupt.expired` is intentionally API-derived from the durable `expiresAt`
included with `interrupt.created`. The SDK does not use an unreliable local TTL
timer.

Interrupt events always retain non-sensitive structure: `kind`,
`interactionMode`, `optionCount`, `schemaId`, and `schemaVersion`.
`interactionMode` distinguishes `static-options`, `dynamic-picker`, and
`freeform` requests, so a client-resolved picker is not mistaken for a choice
with zero options. Questions and static option labels follow output-content
capture; a submitted human response follows input-content capture. Option
values and resume capability tokens are never included in interrupt telemetry.

`run.cancelled` records aborted active executions. Custom HTTP routes must forward
`request.signal`; `createChatRouteHandler` forwards it automatically. Cancelling a
`toSSE` response body also cancels its active execution source.

## Complete error diagnostics

Set `diagnostics: { enabled: true }` on `createKortyxTelemetryAdapter` after
upgrading the API/Studio and granting `diagnostics:read` to the Studio reader.
Native capture retains large messages/stacks, causes, aggregate members, custom
fields, and private provider response evidence with credential redaction. Run
errors link to one diagnostic; native upload parts do not become timeline events.

Studio and `kortyx studio diagnostics get|download` retrieve complete content
without application chunk reconstruction. Capture and delivery limits are explicit,
and `flushDiagnostics(timeoutMs)` reports pending and dropped delivery. See the
[deployment and usage guide](../../docs/complete-error-diagnostics.md) for limits,
permissions, spool/retention operations, privacy policy, and rollout instructions.
