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

## Response Shapes

- Choice and multi-choice interrupts: pass selected values.
- Text interrupts: pass text.

Keep UI responses tied to the original interrupt piece so the resume token and request id stay aligned.

## UX States

Provide visible states for:

- waiting for user input
- resume in progress
- resume error
- active stream after resume
