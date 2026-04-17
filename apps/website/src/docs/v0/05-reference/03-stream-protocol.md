---
id: v0-agent-stream-protocol
title: "Stream Chunk Protocol"
description: "Consume typed stream chunks for text deltas, structured data, interrupts, transitions, and completion."
keywords: [kortyx, streamchunk, sse, interrupt, transition, structured-data]
sidebar_label: "Stream Protocol"
---
# Stream Chunk Protocol

The stream protocol is defined in `@kortyx/stream` as `StreamChunk`.

## Core chunk types

- `session`
- `status`
- `text-start`
- `text-delta`
- `text-end`
- `message`
- `structured-data`
- `interrupt`
- `transition`
- `done`
- `error`

## Typical client loop

```ts
import { readStream, type StreamChunk } from "kortyx";

const chunks: StreamChunk[] = [];

for await (const chunk of readStream(response.body)) {
  chunks.push(chunk);

  if (chunk.type === "text-delta") {
    // append to in-flight assistant text
  }

  if (chunk.type === "interrupt") {
    // render selection UI and resume with token/requestId
  }

  if (chunk.type === "done") {
    break;
  }
}
```
```js
import { readStream } from "kortyx";

const chunks = [];

for await (const chunk of readStream(response.body)) {
  chunks.push(chunk);

  if (chunk.type === "text-delta") {
    // append to in-flight assistant text
  }

  if (chunk.type === "interrupt") {
    // render selection UI and resume with token/requestId
  }

  if (chunk.type === "done") {
    break;
  }
}
```

## Structured Data

Simple mental model:

- `text-*` is for text you show as text
- `structured-data` is for objects you render as UI state

Examples:

- email drafts
- job tables
- growing result lists
- progress panels
- validation results

### Structured chunk shape

Example incremental chunk:

```json
{
  "type": "structured-data",
  "node": "planner",
  "streamId": "run_123",
  "dataType": "email.compose",
  "kind": "text-delta",
  "path": "body",
  "delta": "Hi team,",
  "schemaId": "email-compose",
  "schemaVersion": "1",
  "id": "compose-email"
}
```

Example final chunk:

```json
{
  "type": "structured-data",
  "node": "planner",
  "streamId": "run_123",
  "dataType": "email.compose",
  "kind": "final",
  "data": {
    "subject": "Beta access is open",
    "body": "Hi team,\n\nBeta access is open.",
    "bullets": ["Faster setup", "Live streaming UI"]
  }
}
```

Field meanings:

- `streamId`: stable identity for one logical structured stream
- `dataType`: app-defined routing label
- `kind`: how the client should apply this update
- `schemaId` and `schemaVersion`: optional schema metadata
- `id`: optional app identifier
- `node`: workflow node that emitted the payload

### `kind` values

- `set`: set one field at `path`
- `append`: append `items` to an array at `path`
- `text-delta`: append `delta` to a string at `path`
- `final`: replace the whole object with `data` and mark the stream done

That is the full public mental model. Most clients should key by `streamId` and apply chunks in arrival order.

### Recommended client reducer

Use the built-in helper instead of writing your own reducer:

```ts
import {
  applyStructuredChunk,
  type StructuredDataChunk,
  type StructuredStreamState,
} from "kortyx";

const byStreamId: Record<string, StructuredStreamState<Record<string, unknown>>> = {};

function onStructuredChunk(chunk: StructuredDataChunk) {
  byStreamId[chunk.streamId] = applyStructuredChunk(
    byStreamId[chunk.streamId],
    chunk,
  );
}
```
```js
import { applyStructuredChunk } from "kortyx";

const byStreamId = {};

function onStructuredChunk(chunk) {
  byStreamId[chunk.streamId] = applyStructuredChunk(
    byStreamId[chunk.streamId],
    chunk,
  );
}
```

`applyStructuredChunk(...)` returns:

- `data`: current accumulated object
- `status: "streaming" | "done"`
- `streamId`
- `dataType`

If you already have an array of structured chunks, you can also use `reduceStructuredChunks(...)`.

## How `useReason({ structured })` uses this protocol

When you call `useReason(...)` with `structured`, there are two main modes.

### Final-only mode

If you do not configure `structured.fields`, Kortyx emits one `structured-data` chunk with `kind: "final"` after the model output validates.

### Incremental mode

If you set `structured.fields`, Kortyx can turn selected parts of the streamed JSON into deterministic structured updates before the final object arrives.

Example:

```ts
const result = await useReason({
  model: google("gemini-2.5-flash"),
  input: "Write an email draft as JSON.",
  outputSchema: EmailDraftSchema,
  structured: {
    dataType: "email.compose",
    stream: true,
    fields: {
      subject: "set",
      body: "text-delta",
      bullets: "append",
    },
  },
});
```
```js
const result = await useReason({
  model: google("gemini-2.5-flash"),
  input: "Write an email draft as JSON.",
  outputSchema: EmailDraftSchema,
  structured: {
    dataType: "email.compose",
    stream: true,
    fields: {
      subject: "set",
      body: "text-delta",
      bullets: "append",
    },
  },
});
```

In that mode:

- the model still returns JSON for the full schema
- Kortyx watches the stream and emits early structured updates for declared fields
- all updates from that reasoning call share one `streamId`
- the final validated object still arrives as `kind: "final"`

Current limits:

- top-level `set` fields
- top-level string fields as `text-delta`
- top-level array fields as `append`
- non-interrupt flows only

> **Good to know:** If a field should appear once and stay stable, it is often simpler to emit it from node logic with `useStructuredData({ kind: "set", ... })` instead of waiting for broader model-side incremental support.

## Consuming text and structured data together

Many clients render both channels at once: text for conversation and structured data for UI state.

```ts
import {
  applyStructuredChunk,
  readStream,
  type StructuredStreamState,
} from "kortyx";

let text = "";
const structured: Record<string, StructuredStreamState<Record<string, unknown>>> = {};

for await (const chunk of readStream(response.body)) {
  if (chunk.type === "text-delta") {
    text += chunk.delta;
  }

  if (chunk.type === "structured-data") {
    structured[chunk.streamId] = applyStructuredChunk(
      structured[chunk.streamId],
      chunk,
    );
  }
}
```
```js
import { applyStructuredChunk, readStream } from "kortyx";

let text = "";
const structured = {};

for await (const chunk of readStream(response.body)) {
  if (chunk.type === "text-delta") {
    text += chunk.delta;
  }

  if (chunk.type === "structured-data") {
    structured[chunk.streamId] = applyStructuredChunk(
      structured[chunk.streamId],
      chunk,
    );
  }
}
```

## Notes

- `done` is terminal for a stream run
- `error` may be followed by `done`
- `session` helps clients persist conversation identity
