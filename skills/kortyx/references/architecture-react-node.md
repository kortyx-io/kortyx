# React + Node

Use separate React and Node apps when backend ownership and deployment should be independent from the UI.

## Backend Responsibilities

- Own `createAgent(...)`, workflows, nodes, providers, auth, rate limits, and persistence.
- Expose a chat route that accepts messages, session/workflow ids, and approved context.
- Return SSE for live streaming.
- Return buffered JSON only for non-live clients or tests.

## Frontend Responsibilities

- Use `@kortyx/react` for chat state and transport.
- Render finalized messages separately from in-flight stream pieces.
- Send only request metadata as client context.
- Never send provider credentials or server-only config to the browser.

## Transport

Use `createRouteChatTransport(...)` when the backend route follows the Kortyx stream protocol. For a custom backend route, implement a `ChatTransport` and forward `AbortSignal`.

## Runtime

The Node API can be Express, Fastify, Hono, or another HTTP framework. The architecture rule is the same: server owns Kortyx execution; React consumes the stream protocol.

