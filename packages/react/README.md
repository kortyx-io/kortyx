# @kortyx/react

React hooks for Kortyx client streaming experiences.

## Install

```bash
npm install @kortyx/react
```

## Exports

- `useChat`
- `createRouteChatTransport`
- `createChatTransport`
- `createBrowserChatStorage`
- `useStructuredStreams`
- `createLiveChatPieces`
- `toHumanInputPiece`

`useChat` keeps finalized chat history in `messages` and the active assistant
response in `streamContentPieces` while a stream is running.

It also exposes stream controls for UI integrations:

- `abort()` / `canAbort`
- `error` / `clearError()`
- `clearMessages()`
- `resetSession()`
- `resetChat()`
- `respondToInterrupt(...)`

`clearMessages()` keeps the current session. `resetChat()` clears messages,
active stream state, errors, and the session id. Route transports forward
`abort()` through an `AbortSignal`; custom transports should forward
`context.signal` to their own request layer.

`useChat({ context })` forwards request context to the transport. Route
transports send `{ sessionId, workflowId, messages, context }` by default, and
`createRouteChatTransport({ createBody })` can customize that body.
`prepareContextMessages` lets apps replace the default history with summaries
or server-owned history while `useChat` still appends the outgoing message.

## License

Apache-2.0
