# Runtime Context

Use request context for metadata that server-side node code needs, such as `threadId`, `tenantId`, `locale`, or UI mode.

## Rules

- In React clients, pass request metadata through `useChat({ context })`.
- With `createRouteChatTransport(...)`, the default request body includes `{ sessionId, workflowId, messages, context }`.
- In the route, parse the body and pass `body.context` to `agent.streamChat(..., { context })`.
- Authenticate the route and derive sensitive values on the server before passing approved context to Kortyx.
- Read it inside nodes with `useRuntimeContext<T>()`.

## Node Example

```ts
import { useRuntimeContext } from "kortyx";

type AppContext = {
  userId: string;
  tenantId?: string;
};

export const supportNode = async () => {
  const context = useRuntimeContext<AppContext>();

  return {
    data: {
      userId: context.userId,
      tenantId: context.tenantId,
    },
  };
};
```

## Boundary

Client-provided context is not trusted authorization state. User id, roles, tenant permissions, and billing access must come from server auth/session data.
