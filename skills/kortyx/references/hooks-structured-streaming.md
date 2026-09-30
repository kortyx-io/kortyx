# Structured Streaming

Structured streaming is a second channel beside assistant text.

## Choose The Producer

- Use `defineOutputContract(...)` with `useReason({ outputs })` when the model chooses the object.
- Use `useStructuredData({ contract, ... })` when deterministic node logic owns the updates.
- `useReason({ outputSchema, structured })` is a deprecated compatibility path, removed in the next major.

## Chunk Model

- `text-*` chunks render assistant text.
- `structured-data` chunks render object/UI state.
- `streamId` identifies one logical structured stream.
- `kind` tells the client reducer how to apply the update.
- `structured-data-invalidated` removes a provisional stream if generation or final validation fails; rollback invalidations additionally identify the checkpoint.

## `useStructuredData(...)`

Use `useStructuredData(...)` when node code, not the model, owns the object updates.

```ts
import { useStructuredData } from "kortyx";

export const searchNode = async ({ input }: { input: unknown }) => {
  const streamId = "search-results";

  useStructuredData({
    id: "search-status",
    streamId,
    dataType: "search.results",
    kind: "set",
    path: "status",
    value: "searching",
  });

  const results = await searchDocuments(String(input ?? ""));

  useStructuredData({
    id: "search-results",
    streamId,
    dataType: "search.results",
    kind: "append",
    path: "items",
    items: results,
  });

  useStructuredData({
    id: "search-final",
    streamId,
    dataType: "search.results",
    data: {
      status: "done",
      items: results,
    },
  });

  return {
    data: { results },
  };
};
```

Use a stable `streamId` when several chunks update the same logical object. Without one, each call may create a separate stream.

## Targeted Path Updates

Manual `useStructuredData(...)` calls can update one path without replacing the whole object.

```ts
useStructuredData({
  streamId: "email-draft",
  dataType: "email.compose",
  kind: "set",
  path: "email.subject",
  value: "Updated subject",
});
```

This updates `email.subject` in the client reducer and leaves sibling fields such as `email.body` untouched.

Supported targeted operations:

- `set`: replace the value at `path`.
- `append`: append items to the array at `path`.
- `text-delta`: append text to the string at `path`.

Paths use dot notation such as `email.subject`, `draft.body`, or `table.rows`. Numeric path segments target array indexes.

Do not send a `final` chunk with a partial object unless replacing the stream state with that partial object is intended. A `final` chunk completes the stream and replaces the stream data with `data`.

## Field Modes

Use incremental field modes for literal structured paths:

- `set`: replace the field value.
- `text-delta`: append string deltas.
- `append`: append completed array items.
- `final`: complete validated object.

For `useStructuredData(...)`, `path` can target structured reducer paths. Contract `stream.fields` can use literal nested paths such as `draft.body`, `intro.question_text`, or `assessment_points.0.criteria_label`, plus single-segment `*` patterns such as `assessment_points.*.criteria_label`.

An output contract with `stream.fields` emits configured fields as realtime `structured-data` chunks. The dedicated JSON pass suppresses raw assistant `text-delta` chunks because those would be partial JSON, not user-facing prose. The model may stream normal text before and after an emitted contract when the provider supports tool streaming.

Do not ask for raw `text-delta` streaming just to get structured output for known fields. Declare `stream.fields` on the contract instead:

```ts
import { defineOutputContract, useReason } from "kortyx";
import { z } from "zod";

const DraftSchema = z.object({
  intro: z.object({ question_text: z.string() }),
  draft: z.object({ subject: z.string(), bullets: z.array(z.string()) }),
});
const draft = defineOutputContract({
  description: "Show the growing draft.",
  schemaId: "guide.draft",
  schemaVersion: "1",
  schema: DraftSchema,
  stream: {
    fields: {
      "intro.question_text": "text-delta",
      "draft.subject": "set",
      "draft.bullets": "append",
    },
  },
});

await useReason({ model, input, outputs: { emit: { draft } } });
```

For model-generated object keys, a contract can declare `stream: { fields: { "assessment_points.*.criteria_label": "set" } }`.

Wildcard matches emit concrete paths such as `assessment_points.commercial_resilience.criteria_label`. `*` matches exactly one object key or array index segment; recursive `**` patterns are not supported.

## Choosing Between APIs

- Model chooses object generation: `useReason({ outputs: { emit, return } })` with output contracts.
- Node/app logic owns updates: `useStructuredData({ contract, ... })`.
- Need literal nested reducer paths: contract `stream.fields` or `useStructuredData(...)`.
- Need wildcard/dynamic-key streaming: use single-segment `*` patterns in contract `stream.fields`; prefer array schemas for long ordered lists.
- Need only a final validated model object: define a non-streamed `outputs.return` contract.
- Need a model to edit only part of an existing object: ask the model for a patch object, validate it, merge it with the existing object in node code, then emit targeted `useStructuredData(...)` updates for the changed paths.

## Client Expectation

React clients should render finalized history from `messages` and the active assistant response from `streamContentPieces`.

Avoid also returning the same object in `ui.structured` unless a separate final structured chunk is intentionally desired.
