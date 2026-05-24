# @kortyx/otel

OpenTelemetry adapter for Kortyx tracing.

This package translates Kortyx run, node, `useReason`, and generation telemetry into OpenTelemetry spans. It does not configure exporters or depend on any observability backend.

```ts
import { createOpenTelemetryTraceAdapter } from "@kortyx/otel";
import { createAgent } from "kortyx";

export const agent = createAgent({
  workflows,
  getProvider,
  telemetry: {
    trace: createOpenTelemetryTraceAdapter(),
  },
});
```

Configure the OpenTelemetry SDK and exporter in your app server bootstrap.
