# Next.js

## API Route Path

Use a Next.js API route for live streaming.

## Simple Route

Use `createChatRouteHandler({ agent })` when the default body parsing, streaming, buffered JSON, and error behavior are enough.

```ts
import { createChatRouteHandler } from "kortyx";
import { agent } from "@/lib/kortyx-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handleChat = createChatRouteHandler({ agent });

export async function POST(request: Request): Promise<Response> {
  return handleChat(request);
}
```

Use a custom route when you need auth, rate limits, custom request context, custom status codes, or custom buffered behavior.

## Custom Route

```ts
import { agent } from "@/lib/kortyx-client";
import {
  collectBufferedStream,
  createFailureResponse,
  parseChatRequestBody,
  readRequestJson,
  toSSE,
} from "kortyx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  // App-owned auth helper. Replace with the app's auth/session layer.
  // Keep its response/redirect handling outside the Kortyx failure boundary.
  const user = await requireUser(request);

  try {
    const body = parseChatRequestBody(await readRequestJson(request));
    const stream = await agent.streamChat(body.messages, {
      abortSignal: request.signal,
      sessionId: body.sessionId,
      workflowId: body.workflowId,
      context: {
        ...body.context,
        userId: user.id,
      },
    });

    if (body.stream === false) {
      return Response.json(await collectBufferedStream(stream));
    }

    return toSSE(stream);
  } catch (error) {
    return createFailureResponse(error);
  }
}
```

The shared error helpers require the coordinated error-contract release. Check installed exports and read [Error handling](error-handling.md) before adapting an older application. `createFailureResponse` propagates control flow and emits safe diagnostics for ordinary failures.

Client shape:

```ts
const chat = useChat({
  transport: createRouteChatTransport({ endpoint: "/api/chat" }),
  context: {
    threadId,
    tenantId,
  },
});
```

`createRouteChatTransport(...)` includes `context` in the request body by default. The route should validate or merge it with server-derived context before calling `agent.streamChat(...)`.

## Server Action Path

Use Server Actions for buffered flows only. They are not the preferred choice for live token/chunk rendering.

## Rules

- Set `runtime = "nodejs"` for routes that use server/runtime dependencies.
- Authenticate and rate-limit the API route before calling `agent.streamChat`.
- Derive sensitive context on the server.
- Use `body.stream === false` only when the caller explicitly wants buffered JSON.
- Do not trust client-sent `context` for user id, roles, permissions, billing, or tenant access.
