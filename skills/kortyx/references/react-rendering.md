# Rendering

Render finalized history and active output from different sources.

## Rules

- Render `messages` for completed chat history.
- Render the current assistant response from `streamContentPieces`.
- Expect text, structured data, interrupts, and errors to appear before finalization.
- When the stream finishes, `useChat(...)` builds and appends the final assistant message.
- Do not render active stream text from both `streamContentPieces` and a duplicated `message` chunk.

## Why

Finalized history should not re-render on every token. Active stream pieces are the live rendering surface.

## Rendering Pattern

```tsx
return (
  <div>
    {chat.messages.map((message) => (
      <MessageBubble key={message.id} message={message} />
    ))}

    {chat.streamContentPieces.length > 0 ? (
      <AssistantLiveMessage pieces={chat.streamContentPieces} />
    ) : null}
  </div>
);
```

## Piece Types

Render pieces by type:

- text pieces: append/render live assistant text.
- structured pieces: render cards, progress, previews, or domain UI.
- interrupt pieces: render choice/text input controls and call `respondToInterrupt`.
- error pieces or `chat.error`: show a recoverable error state.

## Common Mistakes

- Rendering `messages` plus the latest active text from `messages` again.
- Treating `messages` as token-by-token state.
- Ignoring `streamContentPieces` and wondering why live streaming appears delayed.
- Rendering interrupt UI without preserving the original piece's `resumeToken` and `requestId`.
