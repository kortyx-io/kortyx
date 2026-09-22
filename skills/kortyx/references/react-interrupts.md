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
  if (piece.schemaId === "account-picker") {
    return (
      <AccountPicker
        onSubmit={(account) =>
          chat.respondToInterrupt(piece, {
            selected: [account.id],
            text: account.label,
          })
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

Use `piece.schemaId` for app-specific routing when the server set it on a
`defineInterruptContract(...)` definition or `useInterrupt(...)` request.
`HumanInputPiece` also preserves `schemaVersion`, `interruptId`, and public `meta` so clients can select custom pickers without joining against debug chunks.

Model-driven interrupt contracts arrive as `kind: "custom"` pieces. The built-in
projection preserves `contract`, opaque validated `request`, `schemaId`, and
`schemaVersion`. Validate or narrow `piece.request` with the same client-safe schema
before rendering app-specific controls:

```tsx
if (
  piece.kind === "custom" &&
  piece.contract === "accountPicker" &&
  piece.schemaId === "acme.account-picker"
) {
  const request = AccountPickerRequest.safeParse(piece.request);
  if (!request.success) return <InvalidInterrupt />;

  return (
    <AccountPicker
      candidates={request.data.candidates}
      onSubmit={(id) => {
        const label = request.data.candidates.find((item) => item.id === id)?.label;
        return chat.respondToInterrupt(piece, {
          value: { type: "select", id },
          ...(label ? { text: label } : {}),
        });
      }}
    />
  );
}
```

`value` is the runtime response for a contract interrupt and is validated against
that contract's `responseSchema`. Optional `text` is only the human-readable chat
message. Keep value and display text separate when ids are opaque.

Advanced clients can pass `toHumanInputPiece` to `useChat(...)` to customize how a
raw interrupt chunk becomes a `HumanInputPiece`. Preserve `resumeToken`,
`requestId`, contract/schema identity, and the request payload; otherwise resume
or custom rendering will break. Prefer the built-in projection unless the app
really needs another client-side shape.

## Response Shapes

- Choice and multi-choice `useInterrupt` requests: pass selected values.
- Text `useInterrupt` requests: pass text.
- Model-driven contract requests: pass `{ value }` matching the selected
  contract's response schema.

Keep UI responses tied to the original interrupt piece so the resume token and request id stay aligned.

## What The Server Actually Sees

`respondToInterrupt(piece, { selected, text })` accepts both fields, but they play different roles:

- **`selected`** remains the resume value for legacy `choice`, `text`, and `multi-choice` interrupts. Model interrupt contracts use `respondToInterrupt(piece, { value })`; `piece.request` is the opaque validated request and `value` is validated against the contract response schema. The singular `useReason({ interrupt })` and `result.interruptResponse` are deprecated and removed next major.
- **`text`** is the visible content of the synthetic user message added to chat history after resume. It is never read by the agent runtime for the resume value.
- If you pass `text` without `selected`, `@kortyx/react` coerces it to `selected: [text]` before sending. If you pass **both**, `selected` wins and `text` is purely cosmetic.

This matters for hidden-id pickers: the chat history would show the opaque id unless you set `text` to a human-readable label.

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
