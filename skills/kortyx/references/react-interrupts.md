# Interrupts

Use `respondToInterrupt(piece, response)` from UI components that render an interrupt piece.

## Rendering Pattern

```tsx
import type { HumanInputPiece, UseChatValue } from "@kortyx/react";

function InterruptControls({
  chat,
  piece,
}: {
  chat: UseChatValue;
  piece: HumanInputPiece;
}) {
  if (piece.schemaId === "pick-job") {
    return (
      <JobPicker
        onSubmit={(jobId) =>
          chat.respondToInterrupt(piece, { selected: [jobId] })
        }
      />
    );
  }

  if (piece.schemaId === "pick-agent") {
    return (
      <AgentPicker
        onSubmit={(agentId) =>
          chat.respondToInterrupt(piece, { selected: [agentId] })
        }
      />
    );
  }

  if (piece.kind === "text") {
    return <TextForm onSubmit={(text) => chat.respondToInterrupt(piece, { text })} />;
  }

  return (
    <ChoiceList
      options={piece.options}
      multiple={piece.kind === "multi-choice"}
      onSubmit={(selected) => chat.respondToInterrupt(piece, { selected })}
    />
  );
}
```

`TextForm` and `ChoiceList` represent app UI components; keep the original interrupt `piece` when submitting so the resume token and request id are preserved.

Use `piece.schemaId` for app-specific routing when the server set `interrupt.schemaId` on `useReason(...)` or `useInterrupt(...)`.
`HumanInputPiece` also preserves `schemaVersion`, `interruptId`, and public `meta` so clients can select custom pickers without joining against debug chunks.

## Response Shapes

- Choice and multi-choice interrupts: pass selected values.
- Text interrupts: pass text.

Keep UI responses tied to the original interrupt piece so the resume token and request id stay aligned.

## What The Server Actually Sees

`respondToInterrupt(piece, { selected, text })` accepts both fields, but they play different roles:

- **`selected`** is what the node receives as the resume value (`result.interruptResponse` from `useReason({ interrupt })`, or the return value of `useInterrupt(...)`). The agent runtime builds the resume value from `selected` only — `selected[0]` for `choice` / `text`, the full array for `multi-choice`.
- **`text`** is the visible content of the synthetic user message added to chat history after resume. It is never read by the agent runtime for the resume value.
- If you pass `text` without `selected`, `@kortyx/react` coerces it to `selected: [text]` before sending. If you pass **both**, `selected` wins and `text` is purely cosmetic.

This matters for hidden-id pickers: the chat history would show the opaque id ("job-9f3e…") unless you set `text` to a human-readable label.

```ts
chat.respondToInterrupt(piece, {
  selected: [chosen.id], // reaches the node
  text: chosen.label,    // shown in chat history
});
```

For a free-form `kind: "text"` interrupt where the answer is the visible value, either `{ text: value }` alone or `{ selected: [value], text: value }` works — the resume value and the message content end up identical.

## UX States

Provide visible states for:

- waiting for user input
- resume in progress
- resume error
- active stream after resume

## Text Interrupts And `send(...)` Auto-Resume

`useChat`'s `send(text)` is not always a fresh user turn. Before starting a new run, it checks the live stream and the latest assistant message for a `kind: "text"` interrupt. If found, the call is routed to `respondToHumanInput` against that piece's `resumeToken` and `requestId`.

This is convenient when a `text` interrupt is genuinely awaiting input — the user types into the regular chat input and it lands as the resume payload.

Historical interrupts are not reused. Once a user response or a later assistant message exists, the next `send(...)` starts a fresh turn. Choice and multi-choice interrupts still require an explicit `respondToInterrupt(...)` call from their controls.
