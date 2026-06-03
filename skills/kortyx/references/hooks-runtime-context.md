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

## Prior Messages Are Not In Context

Kortyx splits the incoming `messages` array internally — the last message becomes the node `input`, and the rest go into the agent's `runtime.priorMessages`. `useRuntimeContext<T>()` exposes only the `context` object passed to `agent.streamChat(..., { context })`; `priorMessages` is **not** available through the hook.

If node code needs to see prior turns (for prompt construction, classification of follow-ups, context-aware resolvers), forward a trimmed copy through `context` in the route:

```ts
// route handler
const history = body.messages
  .slice(0, -1)
  .map((m) => ({ role: m.role, content: m.content }));

const approvedContext = {
  ...serverContext,
  ...(history.length > 0 ? { history } : {}),
};

return toSSE(
  await agent.streamChat(body.messages, {
    sessionId: body.sessionId,
    context: approvedContext,
  }),
);
```

```ts
// node
type Ctx = { history?: { role: "user" | "assistant"; content: string }[] };
const { history = [] } = useRuntimeContext<Ctx>();
```

Apply an app-owned history limit and filtering policy before putting prior turns into prompts.
