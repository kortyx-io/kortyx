---
id: v0-runtime-context
title: "Runtime Context"
description: "Pass request metadata from clients and routes into node code without mixing it with user input or node params."
keywords: [kortyx, runtime-context, useRuntimeContext, context, request-metadata]
sidebar_label: "Runtime Context"
---
# Runtime Context

Runtime context is request metadata that server-side node code may need during one chat run.

Use it for values such as selected thread id, locale, UI mode, tenant hints, or server-approved auth context. Do not use it for the user's message. Do not use it as static node configuration.

## The Three Inputs

Kortyx has three different data lanes:

| Lane | Where it comes from | Where to read it |
| --- | --- | --- |
| `input` | latest user message, then merged node `data` | node function argument |
| `params` | workflow node definition | node function argument |
| runtime `context` | route/client request metadata | `useRuntimeContext(...)` |

## Client to Node Flow

With `@kortyx/react`, pass request metadata through `useChat({ context })`.

```tsx
import { createRouteChatTransport, useChat } from "@kortyx/react";

export function ChatPage({ threadId }: { threadId: string }) {
  const chat = useChat({
    transport: createRouteChatTransport({
      endpoint: "/api/chat",
    }),
    context: {
      threadId,
      locale: "en-US",
    },
  });

  return <ChatWindow chat={chat} />;
}
```
```jsx
import { createRouteChatTransport, useChat } from "@kortyx/react";

export function ChatPage({ threadId }) {
  const chat = useChat({
    transport: createRouteChatTransport({
      endpoint: "/api/chat",
    }),
    context: {
      threadId,
      locale: "en-US",
    },
  });

  return <ChatWindow chat={chat} />;
}
```

The default route transport sends a body shaped like this:

```json
{
  "sessionId": "session-id",
  "workflowId": "optional-workflow",
  "messages": [{ "role": "user", "content": "Summarize this thread" }],
  "context": { "threadId": "thread-123", "locale": "en-US" }
}
```

In your route, parse the request and pass approved context into `agent.streamChat(...)`.

```ts
import { parseChatRequestBody, toSSE } from "kortyx";
import { agent } from "@/lib/kortyx-client";
import { requireUser } from "@/services/auth";

export async function POST(request: Request): Promise<Response> {
  const user = await requireUser(request);
  const body = parseChatRequestBody(await request.json());

  const stream = await agent.streamChat(body.messages, {
    sessionId: body.sessionId,
    workflowId: body.workflowId,
    context: {
      threadId: body.context?.threadId,
      locale: body.context?.locale,
      userId: user.id,
      tenantId: user.tenantId,
    },
  });

  return toSSE(stream);
}
```
```js
import { parseChatRequestBody, toSSE } from "kortyx";
import { agent } from "@/lib/kortyx-client";
import { requireUser } from "@/services/auth";

export async function POST(request) {
  const user = await requireUser(request);
  const body = parseChatRequestBody(await request.json());

  const stream = await agent.streamChat(body.messages, {
    sessionId: body.sessionId,
    workflowId: body.workflowId,
    context: {
      threadId: body.context?.threadId,
      locale: body.context?.locale,
      userId: user.id,
      tenantId: user.tenantId,
    },
  });

  return toSSE(stream);
}
```

> **Good to know:** Client-sent context is request metadata, not trusted authorization state. Authenticate the route and derive sensitive values such as user id, roles, tenant permissions, and billing access on the server.

## Read Context in a Node

Inside node execution, call `useRuntimeContext(...)`.

```ts
import { useRuntimeContext } from "kortyx";

type AppContext = {
  threadId?: string;
  locale?: string;
  userId: string;
  tenantId: string;
};

export async function supportNode() {
  const context = useRuntimeContext<AppContext>();

  return {
    data: {
      threadId: context.threadId,
      userId: context.userId,
      tenantId: context.tenantId,
    },
  };
}
```
```js
import { useRuntimeContext } from "kortyx";

export async function supportNode() {
  const context = useRuntimeContext();

  return {
    data: {
      threadId: context.threadId,
      userId: context.userId,
      tenantId: context.tenantId,
    },
  };
}
```

`useRuntimeContext(...)` returns an object. If no context was passed for the request, it returns an empty object.

## What Not to Put in Context

- Do not put provider credentials in context.
- Do not trust client-provided user ids, roles, permissions, or tenant access.
- Do not put large documents or full chat history in context; use messages, summaries, retrieval, or app services.
- Do not use context for static node settings; use node `params`.

## What to Read Next

- [Nodes](./03-nodes.md) for `input`, `params`, and `data`
- [streamChat](./06-stream-chat.md) for request handling
- [React Client](../05-reference/06-react-client.md) for `useChat({ context })`
- [SSE for API Routes](../03-guides/11-sse.md) for authenticated streaming routes
