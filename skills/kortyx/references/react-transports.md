# Transports

Use `createRouteChatTransport(...)` for API routes that follow the Kortyx stream protocol.

```ts
const transport = createRouteChatTransport({
  endpoint: "/api/chat",
});
```

By default, the route transport sends:

```ts
{
  sessionId,
  workflowId,
  messages,
  context,
}
```

The route should parse this body and forward `context` to `agent.streamChat(...)`.

## Custom Transports

Implement a custom `ChatTransport` only when the backend route shape is not compatible with the default helper.

Rules:

- Forward `context.signal` to `fetch` or the request layer.
- Call `onChunk` for every parsed stream chunk.
- Preserve `sessionId`, `workflowId`, `messages`, and `context` semantics.
- Surface transport errors through the hook rather than swallowing them.
