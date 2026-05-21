# @kortyx/react

[![npm version](https://img.shields.io/npm/v/@kortyx/react.svg)](https://www.npmjs.com/package/@kortyx/react)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/react.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![React](https://img.shields.io/badge/React-%3E%3D19-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

React hooks and transport helpers for Kortyx client streaming experiences.

## Install

```bash
pnpm add @kortyx/react
```

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

## Example

```tsx
"use client";

import { createRouteChatTransport, useChat } from "@kortyx/react";

export function Chat() {
  const chat = useChat({
    transport: createRouteChatTransport({ endpoint: "/api/chat" }),
  });

  return (
    <button onClick={() => chat.send("Summarize this account")}>
      Send
    </button>
  );
}
```

## Documentation

- [Documentation](https://kortyx.io/docs)
- [React client](https://kortyx.io/docs/reference/react-client)
- [Quickstart: Next.js API Route](https://kortyx.io/docs/getting-started/quickstart-nextjs)
- [Stream protocol](https://kortyx.io/docs/reference/stream-protocol)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
