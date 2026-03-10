---
id: v0-stream-chat
title: "streamChat"
description: "Use agent.streamChat for flexible route handling, then return SSE or buffered JSON."
keywords: [kortyx, streamChat, sse, workflow-selection, resume]
sidebar_label: "streamChat"
---
# streamChat

`streamChat` is the chat method on the `createAgent(...)` result.

## Recommended usage

```ts
import { createAgent } from "kortyx";

const agent = createAgent({
  workflowsDir: "src/workflows",
});

const stream = await agent.streamChat(messages, {
  // optional
  sessionId,
  workflowId,
});
```
```js
import { createAgent } from "kortyx";

const agent = createAgent({
  workflowsDir: "src/workflows",
});

const stream = await agent.streamChat(messages, {
  // optional
  sessionId,
  workflowId,
});
```

## Custom route mode (`stream` flag)

```ts
import {
  collectBufferedStream,
  collectStream,
  parseChatRequestBody,
  toSSE,
} from "kortyx";

export async function POST(request: Request): Promise<Response> {
  const body = parseChatRequestBody(await request.json());

  const stream = await agent.streamChat(body.messages, {
    // optional
    sessionId: body.sessionId,
    workflowId: body.workflowId,
  });

  if (body.stream === false) {
    // Convenience shape: { chunks, text, structured }
    const buffered = await collectBufferedStream(stream);
    return Response.json(buffered);
  }

  return toSSE(stream);
}
```
```js
import {
  collectBufferedStream,
  collectStream,
  parseChatRequestBody,
  toSSE,
} from "kortyx";

export async function POST(request) {
  const body = parseChatRequestBody(await request.json());

  const stream = await agent.streamChat(body.messages, {
    // optional
    sessionId: body.sessionId,
    workflowId: body.workflowId,
  });

  if (body.stream === false) {
    // Convenience shape: { chunks, text, structured }
    const buffered = await collectBufferedStream(stream);
    return Response.json(buffered);
  }

  return toSSE(stream);
}
```

When `stream` is `false`, buffered JSON includes:
- `chunks`: full raw chunk list
- `text`: merged assistant text (`text-delta` first, `message` fallback)
- `structured`: collected `structured-data` chunks

## Buffered helpers (choose one)

```ts
import { collectBufferedStream, collectStream } from "kortyx";

const stream = await agent.streamChat(messages, { sessionId, workflowId });

// Option A: raw chunks only
const chunks = await collectStream(stream);
return Response.json({ chunks });
```
```js
import { collectBufferedStream, collectStream } from "kortyx";

const stream = await agent.streamChat(messages, { sessionId, workflowId });

// Option A: raw chunks only
const chunks = await collectStream(stream);
return Response.json({ chunks });
```

```ts
import { collectBufferedStream, collectStream } from "kortyx";

const stream = await agent.streamChat(messages, { sessionId, workflowId });

// Option B: convenience buffered result
const buffered = await collectBufferedStream(stream);
return Response.json(buffered); // { chunks, text, structured }
```
```js
import { collectBufferedStream, collectStream } from "kortyx";

const stream = await agent.streamChat(messages, { sessionId, workflowId });

// Option B: convenience buffered result
const buffered = await collectBufferedStream(stream);
return Response.json(buffered); // { chunks, text, structured }
```

> **Good to know:** `collectBufferedStream(...)` is built on top of `collectStream(...)`, so you still get the full raw chunk list in `buffered.chunks`.

## Parameters

- `messages`: full chat history for the current turn (required).
- `options.sessionId`: optional conversation id for analytics/tracing correlation.
- `options.workflowId`: force this request to start in a specific workflow.

## Returns

`agent.streamChat(...)`: `Promise<AsyncIterable<StreamChunk>>`

## What happens under the hood

1. resolves runtime config and session context
2. chooses the workflow (including request-level workflow override)
3. builds initial state from input + prior messages
4. resumes interrupted flows when resume metadata is present
5. runs the workflow graph and streams chunks as SSE
6. returns an async stream of `StreamChunk` events

## Workflow override per request

When not resuming, `options.workflowId` can override entry workflow for this request.

## Resume behavior

If the last message contains resume metadata, `agent.streamChat(...)` resumes the interrupted flow automatically.
