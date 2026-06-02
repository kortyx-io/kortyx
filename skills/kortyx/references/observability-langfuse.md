# Export Kortyx Traces To Langfuse

Use this reference when an app wants Langfuse as an OpenTelemetry backend for Kortyx traces.

## Contract

- Keep `@kortyx/otel` as the Kortyx adapter.
- Keep `LangfuseSpanProcessor` setup app-owned. There is no Langfuse-specific Kortyx package.
- Map Kortyx attributes to `langfuse.*` attributes in `createOpenTelemetryTraceAdapter({ mapAttributes })`.
- Keep raw prompt/output capture off until the app has an approved privacy and retention policy.
- Treat `langfuse.trace.tags` as trace-level context, including when a child `useReason(...)` span adds a tag.

Baseline dependencies:

```bash
pnpm add @kortyx/otel @langfuse/otel @opentelemetry/api @opentelemetry/sdk-node
```

Add `@langfuse/client` only when the app writes scores or uses Langfuse prompt APIs. Add `@langfuse/tracing` only for Langfuse-specific manual observations or context propagation outside Kortyx.

## Span Processor

Configure the processor in server bootstrap code before the Kortyx agent is created:

```ts
// src/lib/otel.ts
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";

export const langfuseSpanProcessor = new LangfuseSpanProcessor({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

export const otelSdk = new NodeSDK({
  spanProcessors: [langfuseSpanProcessor],
});

otelSdk.start();
```

If the app customizes `shouldExportSpan`, verify that the filter still exports Kortyx spans.

## Kortyx Adapter

Map backend-neutral Kortyx attributes at the app boundary:

```ts
// src/lib/kortyx-agent.ts
import "./otel";
import { createOpenTelemetryTraceAdapter } from "@kortyx/otel";
import { createAgent } from "kortyx";

const ROOT_SPAN_NAME = "kortyx.run";

export const agent = createAgent({
  workflows,
  getProvider,
  telemetry: {
    trace: createOpenTelemetryTraceAdapter({
      captureContent: false,
      mapAttributes: ({ name, attributes }) => {
        const additions: Record<string, unknown> = {};

        const tags = attributes["kortyx.trace.tags"];
        if (Array.isArray(tags) && tags.length > 0) {
          additions["langfuse.trace.tags"] = tags;
        }

        for (const [key, value] of Object.entries(attributes)) {
          if (!key.startsWith("kortyx.trace.metadata.")) continue;
          const suffix = key.slice("kortyx.trace.metadata.".length);
          additions[`langfuse.trace.metadata.${suffix}`] = value;
        }

        const input = attributes["kortyx.trace.input"];
        const output = attributes["kortyx.trace.output"];
        if (input !== undefined) additions["langfuse.observation.input"] = input;
        if (output !== undefined) additions["langfuse.observation.output"] = output;

        if (name === ROOT_SPAN_NAME) {
          const workflowId = attributes["kortyx.workflow.id"];
          additions["langfuse.trace.name"] =
            typeof workflowId === "string" ? `agent - ${workflowId}` : "agent";
          if (input !== undefined) additions["langfuse.trace.input"] = input;
          if (output !== undefined) additions["langfuse.trace.output"] = output;
        }

        return Object.keys(additions).length > 0 ? additions : undefined;
      },
      mapPromptMetadata: (prompt) => ({
        ...(prompt.name
          ? { "langfuse.observation.prompt.name": prompt.name }
          : {}),
        ...(Number.isInteger(prompt.version)
          ? { "langfuse.observation.prompt.version": prompt.version }
          : {}),
      }),
    }),
  },
});
```

Set `captureContent: true` only after reviewing the app's data classification. Kortyx defaults content capture to off.

## Next.js And Serverless

Register OTel from `instrumentation.ts` before agent modules are loaded:

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./src/lib/otel");
  }
}
```

`LangfuseSpanProcessor` batches spans. In serverless routes, flush before the runtime freezes:

```ts
import { after } from "next/server";
import { langfuseSpanProcessor } from "@/lib/otel";

export async function POST(request: Request) {
  const response = await handleChat(request);
  after(async () => {
    await langfuseSpanProcessor.forceFlush();
  });
  return response;
}
```

If the instrumentation and route code compile into separate bundles, put the processor in a shared `globalThis`-backed singleton module. The route must flush the same instance that was registered with the tracer provider.

## Optional Managed-Prompt Linking

Tracing does not require a prompt store. When a node uses a Langfuse-managed prompt, preserve its identity:

```ts
const prompt = await promptStore.get("assessment-chat");

await useReason({
  id: "assessment-chat",
  model,
  input: prompt.compile(vars),
  telemetry: {
    prompt: {
      name: prompt.name,
      version: prompt.version,
      metadata: prompt.toJSON(),
    },
    tags: [`prompt:${prompt.name}:${prompt.version}`],
  },
});
```

Langfuse requires `langfuse.observation.prompt.version` to be an integer. Keep string versions such as `"v1"` in `telemetry.prompt.metadata` instead of mapping them as the Langfuse prompt version.

## Client Feedback Scores

`@kortyx/react` copies the active `traceId`, `spanId`, and `runId` onto assistant `ChatMsg` values. Use `msg.traceId` to associate user feedback with a trace.

Do not trust an arbitrary browser-provided trace id when authorization matters:

1. Wrap the Kortyx stream at the route layer.
2. After the native `{ type: "trace", traceId, ... }` chunk, emit a `structured-data` chunk with a signed `{ traceId, userId }` token.
3. Key the token by `traceId` on the client.
4. POST the signed token and score to an authenticated server route.
5. Verify the token, then call `langfuse.score.create(...)`.
6. Call `await langfuse.flush()` before the feedback route resolves.

Score writes use `@langfuse/client`; they do not require `LangfuseSpanProcessor.forceFlush()`.

## Verification

- The first request creates a Langfuse trace named `agent - <workflow-id>`.
- The root `kortyx.run` span carries trace input/output only when content capture is enabled.
- Child `useReason` spans carry model, usage, prompt, and output attributes as available.
- Stable `sessionId` and server-derived `context.userId` appear as Langfuse session/user identity.
- Stable agent tags and request metadata are filterable in Langfuse.
- Short-lived route handlers flush spans before the runtime freezes.
- Feedback score routes verify authorization and flush `@langfuse/client`.

Website walkthrough: `https://kortyx.io/docs/v0/production/langfuse`.
