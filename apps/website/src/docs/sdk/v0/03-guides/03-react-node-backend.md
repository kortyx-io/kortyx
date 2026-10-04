---
id: v0-react-node-backend
title: "React Frontend + Node Backend"
description: "Run Kortyx on a Node backend while a separate React app consumes streamed chat responses."
keywords: [kortyx, react, node, backend, sse, separate-apps]
sidebar_label: "React + Node Backend"
---
# React Frontend + Node Backend

Use this shape when the UI and backend are deployed separately, or when backend ownership should stay independent from the React app.

The architecture rule is simple: the Node backend owns Kortyx execution. The React frontend consumes the stream protocol.

## Backend Responsibilities

- Own `createAgent(...)`, workflows, nodes, providers, auth, rate limits, and runtime persistence.
- Expose a chat route that accepts `messages`, `sessionId`, `workflowId`, and approved `context`.
- Return SSE for live streaming.
- Return buffered JSON only for non-live clients or tests.

## Frontend Responsibilities

- Use `@kortyx/react` for chat state and transport.
- Render finalized `messages` separately from active `streamContentPieces`.
- Send only request metadata as client context.
- Never send provider credentials or server-only config to the browser.

## Backend Route Shape

For a Fetch-compatible Node route, the handler can stay close to the Next.js API route shape.

```ts
import { collectBufferedStream, parseChatRequestBody, toSSE } from "kortyx";
import { agent } from "../lib/kortyx-client";
import { requireUser } from "../services/auth";

export async function handleChatRequest(request: Request): Promise<Response> {
  const user = await requireUser(request);
  const body = parseChatRequestBody(await request.json());

  const stream = await agent.streamChat(body.messages, {
    sessionId: body.sessionId,
    workflowId: body.workflowId,
    context: {
      ...body.context,
      userId: user.id,
      tenantId: user.tenantId,
    },
  });

  if (body.stream === false) {
    return Response.json(await collectBufferedStream(stream));
  }

  return toSSE(stream);
}
```
```js
import { collectBufferedStream, parseChatRequestBody, toSSE } from "kortyx";
import { agent } from "../lib/kortyx-client";
import { requireUser } from "../services/auth";

export async function handleChatRequest(request) {
  const user = await requireUser(request);
  const body = parseChatRequestBody(await request.json());

  const stream = await agent.streamChat(body.messages, {
    sessionId: body.sessionId,
    workflowId: body.workflowId,
    context: {
      ...body.context,
      userId: user.id,
      tenantId: user.tenantId,
    },
  });

  if (body.stream === false) {
    return Response.json(await collectBufferedStream(stream));
  }

  return toSSE(stream);
}
```

Express, Fastify, Hono, and similar frameworks can adapt the same handler shape. Keep the same request body semantics and return the same SSE stream protocol.

> **Good to know:** Always authenticate and rate-limit before calling `agent.streamChat(...)`. Treat client `context` as request metadata only; derive user id, roles, tenant access, and billing access on the backend.

## React Transport

On the frontend, point `createRouteChatTransport(...)` at the backend URL.

```tsx
import { createRouteChatTransport, useChat } from "@kortyx/react";

export function ChatPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const chat = useChat({
    transport: createRouteChatTransport({
      endpoint: `${apiBaseUrl}/chat`,
    }),
    context: {
      source: "web",
    },
  });

  return <ChatWindow chat={chat} />;
}
```
```jsx
import { createRouteChatTransport, useChat } from "@kortyx/react";

export function ChatPage({ apiBaseUrl }) {
  const chat = useChat({
    transport: createRouteChatTransport({
      endpoint: `${apiBaseUrl}/chat`,
    }),
    context: {
      source: "web",
    },
  });

  return <ChatWindow chat={chat} />;
}
```

## Custom Backends

Use a custom transport only when your backend cannot expose the standard Kortyx stream protocol. A custom transport must:

- preserve `sessionId`, `workflowId`, `messages`, and `context` semantics
- call `onChunk` for every parsed stream chunk
- forward `context.signal` to `fetch` or the request layer so `abort()` works
- surface transport errors instead of swallowing them

See [React Client](../05-reference/06-react-client.md#custom-transport) for the full transport shape.

## What to Read Next

- [Project Structure](./01-project-structure.md)
- [Rendering Streamed Chat](./04-render-streamed-chat.md)
- [SSE for API Routes](./11-sse.md)
- [Runtime Context](../02-core-concepts/08-runtime-context.md)
