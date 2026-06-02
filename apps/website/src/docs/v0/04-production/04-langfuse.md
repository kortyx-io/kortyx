---
id: v0-observability-langfuse
title: "Export To Langfuse"
description: "Export vendor-neutral Kortyx OpenTelemetry traces to Langfuse with the correct attribute names, tags, and trace ids surfaced on the React client."
keywords: [kortyx, langfuse, observability, tracing, opentelemetry, scores, feedback]
sidebar_label: "Export To Langfuse"
---
# Export To Langfuse

[Langfuse](https://langfuse.com) ingests Kortyx traces over OpenTelemetry. Kortyx remains backend-neutral: there is no Langfuse-specific Kortyx package and your app owns the exporter setup. Wire `@kortyx/otel` as usual, then map a small number of Kortyx attributes to Langfuse-native names so the UI renders trace input, output, tags, and optional managed-prompt linkage correctly.

This guide assumes you have already read [OpenTelemetry](./03-observability.md). Everything here is additive on top of that setup.

## Install

```bash tabs="lf-install" tab="pnpm"
pnpm add @kortyx/otel @langfuse/otel @opentelemetry/api @opentelemetry/sdk-node
```
```bash tabs="lf-install" tab="npm"
npm install @kortyx/otel @langfuse/otel @opentelemetry/api @opentelemetry/sdk-node
```
```bash tabs="lf-install" tab="yarn"
yarn add @kortyx/otel @langfuse/otel @opentelemetry/api @opentelemetry/sdk-node
```
```bash tabs="lf-install" tab="bun"
bun add @kortyx/otel @langfuse/otel @opentelemetry/api @opentelemetry/sdk-node
```

`@kortyx/otel` is required regardless of backend — it produces the spans. `@langfuse/otel` provides the `LangfuseSpanProcessor` that exports them to Langfuse.

> **Good to know:** Add `@langfuse/tracing` only when your app also needs Langfuse-specific manual observations or context propagation outside Kortyx. It is not required for the Kortyx adapter path below.

## Configure the span processor

Replace the OTLP exporter from the OpenTelemetry guide with Langfuse's span processor, or run both side-by-side.

```ts tabs="lf-bootstrap" tab="TypeScript"
// src/lib/otel.ts
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";

export const langfuseSpanProcessor = new LangfuseSpanProcessor({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL, // optional self-hosted URL
});

export const otelSdk = new NodeSDK({
  spanProcessors: [langfuseSpanProcessor],
});

otelSdk.start();
```
```js tabs="lf-bootstrap" tab="JavaScript"
// src/lib/otel.js
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

The Langfuse span processor [batches spans by default](https://langfuse.com/docs/observability/features/queuing-batching). In short-lived runtimes, flush it before the process exits or the runtime freezes:

```ts tabs="lf-flush" tab="TypeScript"
await langfuseSpanProcessor.forceFlush();
```
```js tabs="lf-flush" tab="JavaScript"
await langfuseSpanProcessor.forceFlush();
```

### Next.js serverless routes

Register your OTel bootstrap from `instrumentation.ts` so tracing starts before the agent:

```ts tabs="lf-next-instrumentation" tab="TypeScript"
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./src/lib/otel");
  }
}
```
```js tabs="lf-next-instrumentation" tab="JavaScript"
// instrumentation.js
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./src/lib/otel");
  }
}
```

In a Vercel or Next.js serverless route, schedule a flush after the response completes:

```ts tabs="lf-next-flush" tab="TypeScript"
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
```js tabs="lf-next-flush" tab="JavaScript"
import { after } from "next/server";
import { langfuseSpanProcessor } from "@/lib/otel";

export async function POST(request) {
  const response = await handleChat(request);
  after(async () => {
    await langfuseSpanProcessor.forceFlush();
  });
  return response;
}
```

> **Good to know:** If your Next.js build creates separate instrumentation and route bundles, keep the processor in a shared `globalThis`-backed singleton module. That ensures the route flushes the same processor instance registered with your tracer provider.

## Translate Kortyx attributes to Langfuse attributes

Kortyx emits attributes under the `kortyx.*` namespace. Langfuse reads its own `langfuse.*` keys. Use the `mapAttributes` hook on the OTel adapter to translate.

```ts tabs="lf-mapper" tab="TypeScript"
// src/lib/kortyx-agent.ts
import "./otel";
import { createOpenTelemetryTraceAdapter } from "@kortyx/otel";
import { createAgent } from "kortyx";
import { getProvider } from "./providers";
import { workflows } from "./workflows";

const ROOT_SPAN_NAME = "kortyx.run";

export const agent = createAgent({
  workflows,
  getProvider,
  telemetry: {
    trace: createOpenTelemetryTraceAdapter({
      captureContent: true,
      mapAttributes: ({ name, attributes }) => {
        const additions: Record<string, unknown> = {};

        // Tags: kortyx.trace.tags → langfuse.trace.tags
        const tags = attributes["kortyx.trace.tags"];
        if (Array.isArray(tags) && tags.length > 0) {
          additions["langfuse.trace.tags"] = tags;
        }

        // Metadata: kortyx.trace.metadata.<k> → langfuse.trace.metadata.<k>
        for (const [key, value] of Object.entries(attributes)) {
          if (!key.startsWith("kortyx.trace.metadata.")) continue;
          const rest = key.slice("kortyx.trace.metadata.".length);
          additions[`langfuse.trace.metadata.${rest}`] = value;
        }

        // Content: kortyx.trace.input/output → langfuse.observation.input/output
        const input = attributes["kortyx.trace.input"];
        const output = attributes["kortyx.trace.output"];
        if (input !== undefined) {
          additions["langfuse.observation.input"] = input;
        }
        if (output !== undefined) {
          additions["langfuse.observation.output"] = output;
        }

        // Root span also drives the top-level trace card in Langfuse
        if (name === ROOT_SPAN_NAME) {
          const workflowId = attributes["kortyx.workflow.id"];
          additions["langfuse.trace.name"] =
            typeof workflowId === "string"
              ? `agent · ${workflowId}`
              : "agent";
          if (input !== undefined) {
            additions["langfuse.trace.input"] = input;
          }
          if (output !== undefined) {
            additions["langfuse.trace.output"] = output;
          }
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
```js tabs="lf-mapper" tab="JavaScript"
// src/lib/kortyx-agent.js
import "./otel";
import { createOpenTelemetryTraceAdapter } from "@kortyx/otel";
import { createAgent } from "kortyx";
import { getProvider } from "./providers";
import { workflows } from "./workflows";

const ROOT_SPAN_NAME = "kortyx.run";

export const agent = createAgent({
  workflows,
  getProvider,
  telemetry: {
    trace: createOpenTelemetryTraceAdapter({
      captureContent: true,
      mapAttributes: ({ name, attributes }) => {
        const additions = {};

        const tags = attributes["kortyx.trace.tags"];
        if (Array.isArray(tags) && tags.length > 0) {
          additions["langfuse.trace.tags"] = tags;
        }

        for (const [key, value] of Object.entries(attributes)) {
          if (!key.startsWith("kortyx.trace.metadata.")) continue;
          const rest = key.slice("kortyx.trace.metadata.".length);
          additions[`langfuse.trace.metadata.${rest}`] = value;
        }

        const input = attributes["kortyx.trace.input"];
        const output = attributes["kortyx.trace.output"];
        if (input !== undefined) {
          additions["langfuse.observation.input"] = input;
        }
        if (output !== undefined) {
          additions["langfuse.observation.output"] = output;
        }

        if (name === ROOT_SPAN_NAME) {
          const workflowId = attributes["kortyx.workflow.id"];
          additions["langfuse.trace.name"] =
            typeof workflowId === "string"
              ? `agent · ${workflowId}`
              : "agent";
          if (input !== undefined) {
            additions["langfuse.trace.input"] = input;
          }
          if (output !== undefined) {
            additions["langfuse.trace.output"] = output;
          }
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

The mapping reference:

| Kortyx attribute                                | Langfuse attribute                       |
|-------------------------------------------------|------------------------------------------|
| `session.id` (from `streamChat.sessionId`)      | already native — no-op                   |
| `user.id` (from `context.userId`)               | already native — no-op                   |
| `kortyx.trace.tags`                             | `langfuse.trace.tags`                    |
| `kortyx.trace.metadata.<k>` (each)              | `langfuse.trace.metadata.<k>`            |
| `kortyx.trace.input` / `.output` (any span)     | `langfuse.observation.input` / `.output` |
| `kortyx.trace.input` / `.output` (run span)     | `langfuse.trace.input` / `.output`       |
| `telemetry.prompt.name` / integer `.version`    | `langfuse.observation.prompt.*`          |
| `kortyx.workflow.id` (run span)                 | drives `langfuse.trace.name`             |

After the first request, Langfuse should show a trace named `agent · <workflow-id>` with the Kortyx run span as its root. If `captureContent` is enabled, the trace card and observations should include their input and output.

## Optional: link managed prompts

Tracing works without a prompt store. If a node uses an external managed prompt, pass its identity through `useReason({ telemetry: { prompt } })` so Langfuse links that generation to the corresponding managed prompt.

Langfuse expects [`langfuse.observation.prompt.version`](https://langfuse.com/integrations/native/opentelemetry#observation-level-attributes) to be an integer. If your prompt store uses string versions such as `"v1"`, keep that value in `telemetry.prompt.metadata` for filtering instead of mapping it as the Langfuse prompt version.

```ts tabs="lf-prompt-linking" tab="TypeScript"
const prompt = await promptStore.get("assessment-chat");

await useReason({
  id: "assessment-chat",
  model,
  input: prompt.compile(vars),
  telemetry: {
    prompt: {
      name: prompt.name,
      version: prompt.version, // use an integer for Langfuse prompt linking
      metadata: prompt.toJSON(),
    },
    tags: [`prompt:${prompt.name}:${prompt.version}`],
  },
});
```
```js tabs="lf-prompt-linking" tab="JavaScript"
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

## Map tags

Tags work the same way as in the generic OpenTelemetry guide — pass them through `telemetry.tags` and the `mapAttributes` hook above translates `kortyx.trace.tags` to `langfuse.trace.tags`. Once translated, tags become filter facets on the Langfuse trace list.

```ts tabs="lf-tags" tab="TypeScript"
createAgent({
  workflows,
  telemetry: {
    trace,
    tags: ["env:production", "service:assistant"],
  },
});

await useReason({
  id: "intent-classifier",
  model,
  input,
  telemetry: {
    tags: ["classifier"],
  },
});
```
```js tabs="lf-tags" tab="JavaScript"
createAgent({
  workflows,
  telemetry: {
    trace,
    tags: ["env:production", "service:assistant"],
  },
});

await useReason({
  id: "intent-classifier",
  model,
  input,
  telemetry: {
    tags: ["classifier"],
  },
});
```

Langfuse treats `langfuse.trace.tags` as trace-level context, even when it sees the attribute on a child observation. Put stable tags such as environment and service on `createAgent(...)`; use per-`useReason` tags only when a generation should add searchable context to the whole trace.

## Score traces from the client

Langfuse scores (thumbs up/down, hallucination flags, deflection rates) are written against a `traceId`. Kortyx surfaces the active trace id to the client via the [trace stream chunk](./03-observability.md#read-trace-ids-from-the-client) and `ChatMsg.traceId` — no header capture or wrapper spans needed.

A minimal feedback flow:

```tsx tabs="lf-score-client" tab="TypeScript"
"use client";

import type { ChatMsg } from "@kortyx/react";

export function Thumbs({ msg }: { msg: ChatMsg }) {
  if (!msg.traceId) return null;
  return (
    <button
      onClick={() => {
        void fetch("/api/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ traceId: msg.traceId, kind: "good" }),
        });
      }}
    >
      👍
    </button>
  );
}
```
```jsx tabs="lf-score-client" tab="JavaScript"
"use client";

export function Thumbs({ msg }) {
  if (!msg.traceId) return null;
  return (
    <button
      onClick={() => {
        void fetch("/api/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ traceId: msg.traceId, kind: "good" }),
        });
      }}
    >
      👍
    </button>
  );
}
```

Then write the score with the Langfuse client in a server route:

```bash tabs="lf-score-install" tab="pnpm"
pnpm add @langfuse/client
```
```bash tabs="lf-score-install" tab="npm"
npm install @langfuse/client
```
```bash tabs="lf-score-install" tab="yarn"
yarn add @langfuse/client
```
```bash tabs="lf-score-install" tab="bun"
bun add @langfuse/client
```

```ts tabs="lf-score-route" tab="TypeScript"
// app/api/feedback/route.ts
import { LangfuseClient } from "@langfuse/client";

const langfuse = new LangfuseClient();

export async function POST(request: Request) {
  const { traceId, kind } = await request.json();
  langfuse.score.create({
    traceId,
    name: "user-feedback",
    value: kind,
    dataType: "CATEGORICAL",
  });
  await langfuse.flush();
  return Response.json({ ok: true });
}
```
```js tabs="lf-score-route" tab="JavaScript"
// app/api/feedback/route.js
import { LangfuseClient } from "@langfuse/client";

const langfuse = new LangfuseClient();

export async function POST(request) {
  const { traceId, kind } = await request.json();
  langfuse.score.create({
    traceId,
    name: "user-feedback",
    value: kind,
    dataType: "CATEGORICAL",
  });
  await langfuse.flush();
  return Response.json({ ok: true });
}
```

> **Good to know:** Accepting a raw `traceId` from the browser lets any authenticated user write scores against any trace id they can guess. If that matters for your app, mint a signed token server-side keyed to `{ traceId, userId }` while the stream is open (you can wrap the kortyx stream and inject the token as an extra `structured-data` chunk after the native `trace` chunk), then verify it in the feedback route.

## What to read next

- Read [OpenTelemetry](./03-observability.md) for the base adapter setup, identity propagation, and prompt metadata.
- Read [`useChat(...)`](../03-guides/04-render-streamed-chat.md) for how `ChatMsg.traceId` flows through the React client.
