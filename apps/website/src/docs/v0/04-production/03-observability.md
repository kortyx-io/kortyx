---
id: v0-observability-opentelemetry
title: "OpenTelemetry"
description: "Trace Kortyx sessions, workflow nodes, model calls, token usage, and prompt metadata with OpenTelemetry."
keywords: [kortyx, opentelemetry, observability, tracing, tokens, gen-ai]
sidebar_label: "OpenTelemetry"
---
# OpenTelemetry

Kortyx can emit server-side OpenTelemetry spans for chat runs, workflow nodes, `useReason(...)`, and provider calls.

Use this when you want to inspect:

- which session and user triggered a run
- which workflow and node handled the request
- which provider/model was called
- token usage and finish reasons
- prompt identity and version metadata
- interrupts, retries, and failures

Kortyx does not configure your collector or tracing backend. Your app owns the OpenTelemetry SDK/exporter setup.

## Install

```bash tabs="otel-install" tab="pnpm"
pnpm add @kortyx/otel @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```
```bash tabs="otel-install" tab="npm"
npm install @kortyx/otel @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```
```bash tabs="otel-install" tab="yarn"
yarn add @kortyx/otel @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```
```bash tabs="otel-install" tab="bun"
bun add @kortyx/otel @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```

## Configure OpenTelemetry on the server

Initialize OpenTelemetry before creating the agent.

```ts tabs="otel-bootstrap" tab="TypeScript"
// src/lib/otel.ts
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

export const otelSdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  }),
});

otelSdk.start();
```
```js tabs="otel-bootstrap" tab="JavaScript"
// src/lib/otel.js
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

export const otelSdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  }),
});

otelSdk.start();
```

> **Good to know:** Keep OpenTelemetry setup in server bootstrap code. React clients should pass stable identifiers such as `sessionId`, while provider calls and token usage stay on the server. If your tracing endpoint requires headers, set `OTEL_EXPORTER_OTLP_TRACES_HEADERS` in the environment instead of adding header parsing to the example.

## Wire Kortyx tracing

Pass the OpenTelemetry adapter when creating the agent.

```ts tabs="otel-agent" tab="TypeScript"
// src/lib/kortyx-agent.ts
import "./otel";
import { createOpenTelemetryTraceAdapter } from "@kortyx/otel";
import { createAgent } from "kortyx";
import { getProvider } from "./providers";
import { workflows } from "./workflows";

export const agent = createAgent({
  workflows,
  getProvider,
  telemetry: {
    trace: createOpenTelemetryTraceAdapter({
      captureContent: false,
    }),
  },
});
```
```js tabs="otel-agent" tab="JavaScript"
// src/lib/kortyx-agent.js
import "./otel";
import { createOpenTelemetryTraceAdapter } from "@kortyx/otel";
import { createAgent } from "kortyx";
import { getProvider } from "./providers";
import { workflows } from "./workflows";

export const agent = createAgent({
  workflows,
  getProvider,
  telemetry: {
    trace: createOpenTelemetryTraceAdapter({
      captureContent: false,
    }),
  },
});
```

See [Capture inputs and outputs](#capture-inputs-and-outputs) before enabling raw prompt or completion capture.

Call the agent normally and pass request context from trusted server code.

```ts tabs="otel-request" tab="TypeScript"
const stream = await agent.streamChat(messages, {
  sessionId: threadId,
  context: {
    userId: user.id,
    tenantId: tenant.id,
  },
});
```
```js tabs="otel-request" tab="JavaScript"
const stream = await agent.streamChat(messages, {
  sessionId: threadId,
  context: {
    userId: user.id,
    tenantId: tenant.id,
  },
});
```

The trace contains a run span, node spans, `useReason` spans, and generation spans. Generation spans include standard `gen_ai.*` attributes for provider/model metadata and token usage.

## Pass identity from React

React clients can pass request context through the route transport. For authenticated apps, treat frontend context as request hints and set the trusted `userId` and `tenantId` on the server from your auth/session layer.

```tsx tabs="otel-react-identity-client" tab="TypeScript"
"use client";

import { createRouteChatTransport, useChat } from "@kortyx/react";

export function Chat({ accountId }: { accountId: string }) {
  const chat = useChat({
    transport: createRouteChatTransport({ endpoint: "/api/chat" }),
    context: {
      accountId,
    },
  });

  return (
    <button onClick={() => chat.send("Summarize this account")}>Send</button>
  );
}
```
```jsx tabs="otel-react-identity-client" tab="JavaScript"
"use client";

import { createRouteChatTransport, useChat } from "@kortyx/react";

export function Chat({ accountId }) {
  const chat = useChat({
    transport: createRouteChatTransport({ endpoint: "/api/chat" }),
    context: {
      accountId,
    },
  });

  return (
    <button onClick={() => chat.send("Summarize this account")}>Send</button>
  );
}
```

On the route, parse the chat body, read the authenticated user, and forward the merged context to the agent.

```ts tabs="otel-react-identity-route" tab="TypeScript"
// app/api/chat/route.ts
import { parseChatRequestBody } from "@kortyx/agent";
import { toSSE } from "@kortyx/stream";
import { agent } from "@/lib/kortyx-agent";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const body = parseChatRequestBody(await request.json());
  const session = await getSession(request);

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const stream = await agent.streamChat(body.messages, {
    sessionId: body.sessionId,
    workflowId: body.workflowId,
    context: {
      ...body.context,
      userId: session.user.id,
      tenantId: session.tenant.id,
    },
  });

  return toSSE(stream);
}
```
```js tabs="otel-react-identity-route" tab="JavaScript"
// app/api/chat/route.js
import { parseChatRequestBody } from "@kortyx/agent";
import { toSSE } from "@kortyx/stream";
import { agent } from "@/lib/kortyx-agent";
import { getSession } from "@/lib/session";

export async function POST(request) {
  const body = parseChatRequestBody(await request.json());
  const session = await getSession(request);

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const stream = await agent.streamChat(body.messages, {
    sessionId: body.sessionId,
    workflowId: body.workflowId,
    context: {
      ...body.context,
      userId: session.user.id,
      tenantId: session.tenant.id,
    },
  });

  return toSSE(stream);
}
```

The `accountId` from the React client is sent in `body.context`, merged into the server context, and recorded as `kortyx.trace.metadata.accountId`. The resulting spans also include `session.id`, `gen_ai.conversation.id`, `user.id`, and `kortyx.tenant.id` when those values are present.

If you want `accountId` as a first-class attribute in your tracing backend, map it in the adapter:

```ts tabs="otel-react-identity-map" tab="TypeScript"
createOpenTelemetryTraceAdapter({
  mapAttributes: ({ attributes }) => ({
    ...(attributes["kortyx.trace.metadata.accountId"]
      ? { "app.account.id": attributes["kortyx.trace.metadata.accountId"] }
      : {}),
  }),
});
```
```js tabs="otel-react-identity-map" tab="JavaScript"
createOpenTelemetryTraceAdapter({
  mapAttributes: ({ attributes }) => ({
    ...(attributes["kortyx.trace.metadata.accountId"]
      ? { "app.account.id": attributes["kortyx.trace.metadata.accountId"] }
      : {}),
  }),
});
```

> **Good to know:** If your app only has an anonymous browser identifier, pass it as app context such as `anonymousId` and map it explicitly in `createOpenTelemetryTraceAdapter({ mapAttributes })`. Use `userId` for authenticated server-derived identities.

## Attach prompt metadata

If your node loads prompts from an external prompt store, pass prompt identity through `useReason({ telemetry })`.

```ts tabs="otel-prompt" tab="TypeScript"
import { useReason } from "kortyx";
import { google } from "../lib/providers";
import { promptStore } from "../lib/prompts";

export async function chatNode() {
  const prompt = await promptStore.get("assessment-chat");
  const input = prompt.compile({ question: "Summarize this candidate" });

  const result = await useReason({
    id: "assessment-chat",
    model: google("gemini-2.5-flash"),
    input,
    telemetry: {
      operation: "assessmentChat",
      prompt: {
        name: prompt.name,
        version: prompt.version,
        type: prompt.type,
        metadata: prompt.toJSON(),
      },
      tags: [`prompt:${prompt.name}:${prompt.version}`],
    },
  });

  return { ui: { message: result.text } };
}
```
```js tabs="otel-prompt" tab="JavaScript"
import { useReason } from "kortyx";
import { google } from "../lib/providers";
import { promptStore } from "../lib/prompts";

export async function chatNode() {
  const prompt = await promptStore.get("assessment-chat");
  const input = prompt.compile({ question: "Summarize this candidate" });

  const result = await useReason({
    id: "assessment-chat",
    model: google("gemini-2.5-flash"),
    input,
    telemetry: {
      operation: "assessmentChat",
      prompt: {
        name: prompt.name,
        version: prompt.version,
        type: prompt.type,
        metadata: prompt.toJSON(),
      },
      tags: [`prompt:${prompt.name}:${prompt.version}`],
    },
  });

  return { ui: { message: result.text } };
}
```

Kortyx records generic prompt attributes such as `gen_ai.prompt.name`, `gen_ai.prompt.version`, and `kortyx.prompt.*`.

## Customize span attributes

Use mapper hooks when your OpenTelemetry pipeline expects additional attributes.

```ts tabs="otel-mapper" tab="TypeScript"
const trace = createOpenTelemetryTraceAdapter({
  mapPromptMetadata: (prompt) => ({
    "app.prompt.metadata": prompt.metadata,
  }),
  mapAttributes: ({ attributes }) => ({
    ...(attributes["kortyx.trace.metadata.tenantId"]
      ? { "app.tenant.id": attributes["kortyx.trace.metadata.tenantId"] }
      : {}),
  }),
});
```
```js tabs="otel-mapper" tab="JavaScript"
const trace = createOpenTelemetryTraceAdapter({
  mapPromptMetadata: (prompt) => ({
    "app.prompt.metadata": prompt.metadata,
  }),
  mapAttributes: ({ attributes }) => ({
    ...(attributes["kortyx.trace.metadata.tenantId"]
      ? { "app.tenant.id": attributes["kortyx.trace.metadata.tenantId"] }
      : {}),
  }),
});
```

> **Good to know:** Prompt text alone is not enough to link a generation to a managed prompt. Pass prompt name, version, type, and any prompt-store metadata in `telemetry.prompt`.

## Capture inputs and outputs

Raw prompts and model outputs can contain sensitive data. Kortyx leaves content capture off by default.

Enable it only when your app has an approved retention and redaction policy.

```ts tabs="otel-content" tab="TypeScript"
createOpenTelemetryTraceAdapter({
  captureContent: {
    input: true,
    output: true,
  },
});
```
```js tabs="otel-content" tab="JavaScript"
createOpenTelemetryTraceAdapter({
  captureContent: {
    input: true,
    output: true,
  },
});
```

## What to read next

- Read [Runtime Context](../02-core-concepts/08-runtime-context.md) to pass request metadata into nodes.
- Read [Runtime Persistence](./01-persistence.md) if your traced flows use interrupts and resume.
