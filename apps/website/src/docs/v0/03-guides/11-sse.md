---
id: v0-streaming-sse
title: "SSE for API Routes"
description: "Stream Kortyx chunks over HTTP from your API route and consume them safely in browser clients."
keywords: [kortyx, sse, api-route, toSSE, createStreamResponse, readStream]
sidebar_label: "SSE (API Routes)"
---
# SSE for API Routes

Use this page when you expose a chat endpoint and want live chunk streaming in the browser.

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

> **Good to know:** `toSSE(...)` is the route-level helper you usually want. It sets the SSE headers and writes the stream in SSE format.

## Recommended client pattern for React

If you are building a React client, start with `@kortyx/react`.

```ts
import { createRouteChatTransport, useChat } from "@kortyx/react";

export function ChatPage() {
  const chat = useChat({
    transport: createRouteChatTransport({
      endpoint: "/api/chat",
      getBody: ({ sessionId, workflowId, messages }) => ({
        sessionId,
        workflowId,
        messages,
      }),
    }),
  });

  return <ChatWindow chat={chat} />;
}
```
```js
import { createRouteChatTransport, useChat } from "@kortyx/react";

export function ChatPage() {
  const chat = useChat({
    transport: createRouteChatTransport({
      endpoint: "/api/chat",
      getBody: ({ sessionId, workflowId, messages }) => ({
        sessionId,
        workflowId,
        messages,
      }),
    }),
  });

  return <ChatWindow chat={chat} />;
}
```

Use `chat.messages` for finalized history and `chat.streamContentPieces` for the current in-flight assistant response.

> **Good to know:** `useChat(...)` already separates assistant text, structured streams, interrupts, and storage. Most React apps should start here instead of manually reducing raw chunks.

## Custom React UI with structured streams

If you want your own UI but not the full chat abstraction, use `useStructuredStreams()` and only wire the parts you care about.

```ts
import { useStructuredStreams } from "@kortyx/react";
import { readStream } from "kortyx/browser";

export function StructuredPanel() {
  const structured = useStructuredStreams<Record<string, unknown>>();
  let text = "";

  async function load() {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    for await (const chunk of readStream(response.body)) {
      if (chunk.type === "text-delta") {
        text += chunk.delta;
      }

      structured.applyStreamChunk(chunk);

      if (chunk.type === "done") {
        break;
      }
    }
  }

  return null;
}
```
```js
import { useStructuredStreams } from "@kortyx/react";
import { readStream } from "kortyx/browser";

export function StructuredPanel() {
  const structured = useStructuredStreams();
  let text = "";

  async function load() {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    for await (const chunk of readStream(response.body)) {
      if (chunk.type === "text-delta") {
        text += chunk.delta;
      }

      structured.applyStreamChunk(chunk);

      if (chunk.type === "done") {
        break;
      }
    }
  }

  return null;
}
```

This keeps the structured-stream reducer logic framework-owned while leaving text rendering and layout up to you.

## Example: render a streamed email draft

If a node uses `useReason({ structured: { fields: { body: "text-delta", bullets: "append" } } })`, the client can render the draft while the model is still writing:

```ts
const email = structured["some-stream-id"];

if (email?.dataType === "email.compose") {
  const draft = email.data as {
    subject?: string;
    body?: string;
    bullets?: string[];
  };

  renderSubject(draft.subject ?? "");
  renderBody(draft.body ?? "");
  renderBullets(draft.bullets ?? []);
  setLoading(email.status === "streaming");
}
```
```js
const email = structured["some-stream-id"];

if (email?.dataType === "email.compose") {
  const draft = email.data;

  renderSubject(draft.subject ?? "");
  renderBody(draft.body ?? "");
  renderBullets(draft.bullets ?? []);
  setLoading(email.status === "streaming");
}
```

## `kind` semantics

Structured chunks use one of four kinds:

- `set`: replace a value at a path
- `append`: append items to an array at a path
- `text-delta`: append text to a string at a path
- `final`: replace the whole object and mark the stream complete

You usually do not need to implement these rules yourself. `useStructuredStreams()` and `useChat()` already apply them for you.

### Path behavior

- `path` is a dot-separated location inside the object being built
- raw structured chunks and manual `useStructuredData(...)` calls can use dotted paths such as `draft.body`
- `useReason({ structured: { fields } })` is narrower and currently accepts top-level field keys only
- `applyStructuredChunk(...)` throws on malformed paths, impossible container-shape conflicts, `append` on non-arrays, `text-delta` on non-strings, and any chunk that arrives after `final`
- `final` replaces the whole accumulated object and should be treated as the source of truth

> **Good to know:** If a single object streams multiple fields over time, keep one `streamId` for that whole object. Use different `streamId` values only for independent objects.

> **Good to know:** `streamId` is the update identity for structured streams. If a node emits multiple related `useStructuredData(...)` calls, keep the same `streamId` so the client updates one object instead of creating many.

## Advanced: manual reducer path

If you are not using React, or you want the raw reducer directly, use `applyStructuredChunk(...)` from `kortyx/browser`.

```ts
import {
  applyStructuredChunk,
  readStream,
  type StructuredStreamState,
} from "kortyx/browser";

let text = "";
const structured: Record<
  string,
  StructuredStreamState<Record<string, unknown>>
> = {};

const response = await fetch("/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ messages }),
});

for await (const chunk of readStream(response.body)) {
  if (chunk.type === "text-delta") {
    text += chunk.delta;
  }

  if (chunk.type === "structured-data") {
    structured[chunk.streamId] = applyStructuredChunk(
      structured[chunk.streamId],
      chunk,
    );
  }

  if (chunk.type === "done") {
    break;
  }
}
```
```js
import { applyStructuredChunk, readStream } from "kortyx/browser";

let text = "";
const structured = {};

const response = await fetch("/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ messages }),
});

for await (const chunk of readStream(response.body)) {
  if (chunk.type === "text-delta") {
    text += chunk.delta;
  }

  if (chunk.type === "structured-data") {
    structured[chunk.streamId] = applyStructuredChunk(
      structured[chunk.streamId],
      chunk,
    );
  }

  if (chunk.type === "done") {
    break;
  }
}
```

## `consumeStream(...)`

If you prefer the callback helper:

```ts
import {
  applyStructuredChunk,
  consumeStream,
  streamChatFromRoute,
} from "kortyx/browser";

const structured = {};

const stream = streamChatFromRoute({
  endpoint: "/api/chat",
  messages,
});

await consumeStream(stream, {
  onChunk: (chunk) => {
    if (chunk.type === "structured-data") {
      structured[chunk.streamId] = applyStructuredChunk(
        structured[chunk.streamId],
        chunk,
      );
    }
  },
});
```
```js
import {
  applyStructuredChunk,
  consumeStream,
  streamChatFromRoute,
} from "kortyx/browser";

const structured = {};

const stream = streamChatFromRoute({
  endpoint: "/api/chat",
  messages,
});

await consumeStream(stream, {
  onChunk: (chunk) => {
    if (chunk.type === "structured-data") {
      structured[chunk.streamId] = applyStructuredChunk(
        structured[chunk.streamId],
        chunk,
      );
    }
  },
});
```

## Infrastructure notes

- `toSSE(...)` and `createStreamResponse(...)` set `content-type: text/event-stream`
- they also set `cache-control: no-cache`, `connection: keep-alive`, and `x-accel-buffering: no`
- keep this route on a runtime that supports streaming responses
- if you run behind a proxy or CDN, make sure response buffering is disabled

> **Good to know:** If your client needs a single buffered result instead of live chunks, expose a non-stream mode and return `collectBufferedStream(...)` from your route.

## Low-level helper

Use `createStreamResponse(...)` only when you already have your own `AsyncIterable<StreamChunk>` and want to convert it to SSE directly.

For chunk types and protocol details, see [Stream Protocol](../05-reference/03-stream-protocol.md).
