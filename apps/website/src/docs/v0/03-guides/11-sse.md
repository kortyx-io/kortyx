---
id: v0-streaming-sse
title: "SSE for API Routes"
description: "Stream Kortyx chunks over HTTP from your API route and consume them safely in browser clients."
keywords: [kortyx, sse, api-route, toSSE, createStreamResponse, readStream]
sidebar_label: "SSE (API Routes)"
---
# SSE for API Routes

Use this page when you expose a chat endpoint and want live token/chunk streaming to the UI.

## Recommended server pattern (`toSSE`)

```ts
import { parseChatRequestBody, toSSE } from "kortyx";
import { agent } from "@/lib/kortyx-client";

export async function POST(request: Request): Promise<Response> {
  const body = parseChatRequestBody(await request.json());
  const stream = await agent.streamChat(body.messages, {
    sessionId: body.sessionId,
    workflowId: body.workflowId,
  });

  return toSSE(stream);
}
```
```js
import { parseChatRequestBody, toSSE } from "kortyx";
import { agent } from "@/lib/kortyx-client";

export async function POST(request) {
  const body = parseChatRequestBody(await request.json());
  const stream = await agent.streamChat(body.messages, {
    sessionId: body.sessionId,
    workflowId: body.workflowId,
  });

  return toSSE(stream);
}
```

> **Good to know:** `toSSE(...)` is the route-level helper you usually want. It sets correct SSE headers and writes chunks in SSE format.

## Client consumption

For the full list of chunk events and meanings, see [Stream Protocol](../05-reference/03-stream-protocol.md).

```ts
import { consumeStream, streamChatFromRoute } from "kortyx";

const stream = streamChatFromRoute({
  endpoint: "/api/chat",
  messages,
});

await consumeStream(stream, {
  onChunk: (chunk) => {
    if (chunk.type === "text-delta") {
      // append text incrementally
    }
  },
});
```
```js
import { consumeStream, streamChatFromRoute } from "kortyx";

const stream = streamChatFromRoute({
  endpoint: "/api/chat",
  messages,
});

await consumeStream(stream, {
  onChunk: (chunk) => {
    if (chunk.type === "text-delta") {
      // append text incrementally
    }
  },
});
```

If you need manual `fetch`, parse SSE with `readStream(...)`:

```ts
import { readStream } from "kortyx";

const response = await fetch("/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ messages }),
});

for await (const chunk of readStream(response.body)) {
  if (chunk.type === "done") break;
}
```
```js
import { readStream } from "kortyx";

const response = await fetch("/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ messages }),
});

for await (const chunk of readStream(response.body)) {
  if (chunk.type === "done") break;
}
```

## Infrastructure notes

- `toSSE(...)` / `createStreamResponse(...)` set:
  - `content-type: text/event-stream`
  - `cache-control: no-cache`
  - `connection: keep-alive`
  - `x-accel-buffering: no`
- Keep this route on a runtime that supports streaming responses.
- If you run behind a proxy/CDN, make sure response buffering is disabled.

> **Good to know:** If your client needs a single buffered result instead of live chunks, expose a non-stream mode and return `collectBufferedStream(...)` from your route.

## Low-level helper

Use `createStreamResponse(...)` only when you already have your own `AsyncIterable<StreamChunk>` and want to convert it to SSE directly.

For chunk types and protocol details, see [Stream Protocol](../05-reference/03-stream-protocol.md).
