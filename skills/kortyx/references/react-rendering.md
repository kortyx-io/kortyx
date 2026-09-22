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

## Structured Output Placement

Choose placement from the product behavior, not merely from the chunk type:

- Keep structured output inside the assistant turn when it is part of the
  conversation and should replay with message history, such as a compact result
  card or status summary. Render the active version from `streamContentPieces`
  and the finalized version from the assistant message's `contentPieces`.
- Project it into an app-owned surface such as a side panel, canvas, preview, or
  editor when the artifact should remain visible, editable, or navigable
  independently of the chat transcript. Key that projection by
  `piece.data.streamId`; use `dataType`, `schemaId`, and `schemaVersion` to select
  and validate the renderer.
- Treat the final validated structured object (`status: "done"`) as authoritative
  over partial field updates. Do not render the same artifact inline and in an
  external surface unless the duplication is an intentional product choice.
- App-owned projections also own their lifecycle: key them by session and
  `streamId`, apply the invalidated stream ids returned by rollback-based
  operations, and copy only checkpoint-valid data into a fork. `useChat(...)`
  cleans up its own stream state, but it cannot clean a separate application
  store.

## Common Mistakes

- Rendering `messages` plus the latest active text from `messages` again.
- Treating `messages` as token-by-token state.
- Ignoring `streamContentPieces` and wondering why live streaming appears delayed.
- Rendering interrupt UI without preserving the original piece's `resumeToken` and `requestId`.
