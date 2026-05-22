---
id: v0-render-streamed-chat
title: "Rendering Streamed Chat"
description: "Render finalized chat history, active stream pieces, structured data, interrupts, errors, and abort controls with @kortyx/react."
keywords: [kortyx, react, rendering, streamContentPieces, useChat, interrupts]
sidebar_label: "Rendering Streamed Chat"
---
# Rendering Streamed Chat

`useChat(...)` separates completed history from the current in-flight assistant response.

- Render `messages` for finalized chat history.
- Render `streamContentPieces` for the active assistant response.
- Expect text, structured data, interrupts, and errors to appear before finalization.
- When the stream finishes, `useChat(...)` builds and appends the final assistant message.

## Basic Pattern

```tsx
import type { UseChatValue } from "@kortyx/react";

export function ChatWindow({ chat }: { chat: UseChatValue }) {
  return (
    <section>
      {chat.messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {chat.streamContentPieces.length > 0 ? (
        <AssistantLiveMessage pieces={chat.streamContentPieces} chat={chat} />
      ) : null}

      {chat.error ? (
        <button type="button" onClick={() => chat.clearError()}>
          Retry after error
        </button>
      ) : null}
    </section>
  );
}
```
```jsx
export function ChatWindow({ chat }) {
  return (
    <section>
      {chat.messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {chat.streamContentPieces.length > 0 ? (
        <AssistantLiveMessage pieces={chat.streamContentPieces} chat={chat} />
      ) : null}

      {chat.error ? (
        <button type="button" onClick={() => chat.clearError()}>
          Retry after error
        </button>
      ) : null}
    </section>
  );
}
```

## Render Piece Types

Handle each piece type explicitly.

```tsx
import type { ContentPiece, UseChatValue } from "@kortyx/react";

export function AssistantLiveMessage({
  pieces,
  chat,
}: {
  pieces: ContentPiece[];
  chat: UseChatValue;
}) {
  return (
    <div>
      {pieces.map((piece) => {
        if (piece.type === "text") {
          return <p key={piece.id}>{piece.content}</p>;
        }

        if (piece.type === "structured") {
          return <StructuredPreview key={piece.id} data={piece.data} />;
        }

        if (piece.type === "interrupt") {
          return <InterruptForm key={piece.id} piece={piece} chat={chat} />;
        }

        return (
          <p key={piece.id} role="alert">
            {piece.content}
          </p>
        );
      })}
    </div>
  );
}
```
```jsx
export function AssistantLiveMessage({ pieces, chat }) {
  return (
    <div>
      {pieces.map((piece) => {
        if (piece.type === "text") {
          return <p key={piece.id}>{piece.content}</p>;
        }

        if (piece.type === "structured") {
          return <StructuredPreview key={piece.id} data={piece.data} />;
        }

        if (piece.type === "interrupt") {
          return <InterruptForm key={piece.id} piece={piece} chat={chat} />;
        }

        return (
          <p key={piece.id} role="alert">
            {piece.content}
          </p>
        );
      })}
    </div>
  );
}
```

## Interrupt Controls

For interrupt pieces, call `chat.respondToInterrupt(piece, response)` with the same piece you received. This preserves the `resumeToken` and `requestId`.

If your workflow emits multiple interrupt types, route custom controls with `piece.schemaId`.
The piece also preserves `schemaVersion`, `interruptId`, and public `meta` from the server interrupt request.

```tsx
import type { HumanInputPiece, UseChatValue } from "@kortyx/react";

export function InterruptForm({
  piece,
  chat,
}: {
  piece: HumanInputPiece;
  chat: UseChatValue;
}) {
  if (piece.kind === "text") {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void chat.respondToInterrupt(piece, {
            text: String(form.get("answer") ?? ""),
          });
        }}
      >
        <label>
          {piece.question}
          <input name="answer" />
        </label>
        <button type="submit">Send</button>
      </form>
    );
  }

  return (
    <div>
      <p>{piece.question}</p>
      {piece.options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() =>
            void chat.respondToInterrupt(piece, { selected: [option.id] })
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```
```jsx
export function InterruptForm({ piece, chat }) {
  if (piece.kind === "text") {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void chat.respondToInterrupt(piece, {
            text: String(form.get("answer") ?? ""),
          });
        }}
      >
        <label>
          {piece.question}
          <input name="answer" />
        </label>
        <button type="submit">Send</button>
      </form>
    );
  }

  return (
    <div>
      <p>{piece.question}</p>
      {piece.options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() =>
            void chat.respondToInterrupt(piece, { selected: [option.id] })
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

## Abort and Errors

Show an abort control while a stream is active.

```tsx
import type { UseChatValue } from "@kortyx/react";

export function ChatControls({ chat }: { chat: UseChatValue }) {
  return (
    <div>
      {chat.canAbort ? (
        <button type="button" onClick={() => chat.abort()}>
          Stop
        </button>
      ) : null}

      {chat.error ? (
        <button type="button" onClick={() => chat.clearError()}>
          Clear error
        </button>
      ) : null}
    </div>
  );
}
```
```jsx
export function ChatControls({ chat }) {
  return (
    <div>
      {chat.canAbort ? (
        <button type="button" onClick={() => chat.abort()}>
          Stop
        </button>
      ) : null}

      {chat.error ? (
        <button type="button" onClick={() => chat.clearError()}>
          Clear error
        </button>
      ) : null}
    </div>
  );
}
```

## Common Mistakes

- Rendering live assistant text from both `streamContentPieces` and the latest `messages` entry.
- Returning `ui.message` with the same text already streamed by `useReason({ emit: true })`.
- Treating `messages` as token-by-token state.
- Ignoring structured pieces and wondering why cards or previews do not update.
- Rendering interrupt UI without preserving the original piece's `resumeToken` and `requestId`.
- Building a custom transport but not forwarding `AbortSignal`.

## What to Read Next

- [React Client](../05-reference/06-react-client.md)
- [SSE for API Routes](./11-sse.md)
- [Interrupts and Resume](./02-interrupts-and-resume.md)
- [Hooks](../02-core-concepts/07-hooks.md)
