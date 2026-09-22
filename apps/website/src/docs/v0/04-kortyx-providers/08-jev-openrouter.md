---
id: v0-jev-openrouter
title: "TypeSafe Jev through OpenRouter"
description: "Use TypeSafe Jev as a regular Kortyx model with native System One questions and typed decision output."
keywords: [kortyx, openrouter, typesafe, jev, system one, decisions, classification]
sidebar_label: "TypeSafe Jev"
---
# TypeSafe Jev through OpenRouter

TypeSafe Jev is a structured decision model. It returns constrained choices,
scores, and yes/no probabilities rather than generated prose.

Jev still uses the normal Kortyx model and hook shape:

```ts
const result = await useReason({
  model: openrouter("typesafe/jev-1.13"),
  input: ticket,
  outputSchema: TicketDecision,
});
```

The difference is `TicketDecision`: Jev needs native System One questions, so
define it with `jevOutputSchema(...)` instead of a general-purpose Zod object.

## 1. Install and import

Jev support is included in `@kortyx/openrouter`:

```bash
pnpm add @kortyx/openrouter
```

```ts
import { jevOutputSchema, openrouter } from "@kortyx/openrouter";
import { useReason } from "kortyx";
```

It uses the same `OPENROUTER_API_KEY` or `KORTYX_OPENROUTER_API_KEY` credentials
as other OpenRouter models.

## 2. Define native Jev questions

```ts
const TicketDecision = jevOutputSchema({
  queue: {
    type: "choice",
    instructions: "Which team should handle this ticket?",
    criteria: {
      billing: "Invoices, charges, and refunds",
      technical: "Bugs, outages, and login failures",
    },
  },
  urgency: {
    type: "score",
    instructions: "How urgent is this ticket?",
    criteria: [
      "Can wait",
      "Important but work can continue",
      "Customer is blocked",
    ],
  },
  needsHuman: {
    type: "noul",
    instructions: "Does this require a human response?",
    criteria: {
      true: "A person must respond or make a judgment",
      false: "Documentation or an automated answer is sufficient",
    },
  },
});
```

`jevOutputSchema(...)` is deliberately thin. Its question types come from the
official OpenRouter SDK contract, and the returned value is a regular schema
accepted by `useReason({ outputSchema })`.

## 3. Call Jev through `useReason(...)`

```ts
const result = await useReason({
  id: "triage-ticket",
  model: openrouter("typesafe/jev-1.13"),
  input: ticket,
  outputSchema: TicketDecision,
});

result.output?.queue; // "billing" | "technical"
result.output?.urgency; // number from 0 to 2, including fractional values
result.output?.needsHuman; // probability from 0 to 1
```

There is no separate `openrouter.decide(...)` API. Jev is selected through the
same `openrouter(modelId)` helper used for chat models, and it participates in
the normal Kortyx result, tracing, usage, and telemetry flow.

## 4. How question types map to output

| Jev question | Definition | `result.output` |
| --- | --- | --- |
| `choice` | named criteria object | selected criterion key, inferred as a string union |
| `score` | ordered array of 2–10 levels | numeric position from `0` to `criteria.length - 1`; may be fractional |
| `noul` | yes/no instruction with optional criteria | probability of yes from `0` to `1` |

`noul` is intentionally not converted to a boolean. Choose an application
threshold based on the cost of false positives and false negatives:

```ts
const HUMAN_THRESHOLD = 0.8;
const needsHuman = (result.output?.needsHuman ?? 0) >= HUMAN_THRESHOLD;
```

## 5. Native details and normalized result fields

The simplified typed decision lives in `result.output`. Additional native
details remain available for decisions that need uncertainty handling:

```ts
result.output;
result.usage;
result.providerMetadata?.cost;
result.providerMetadata?.answers;
result.raw;
```

`providerMetadata.answers` retains native choice probabilities, score
probabilities and legends, and confidence when returned. `providerMetadata.cost`
retains OpenRouter's reported cost. `result.usage` contains normalized input,
output, and total token counts.

Use `result.output` for ordinary application branching. Read probabilities and
confidence when the application has an explicit uncertainty or review policy.

## 6. Unsupported fields fail or warn explicitly

Known hard incompatibilities fail before the network request:

- `tools` are not supported by Jev
- omitting `jevOutputSchema(...)` fails configuration validation
- supplying an explicit `responseFormat` that replaces the helper metadata
  fails configuration validation

Do not add `responseFormat` manually:

```ts
// Correct: the helper provides the native wire contract.
await useReason({
  model: openrouter("typesafe/jev-1.13"),
  input: ticket,
  outputSchema: TicketDecision,
});
```

Chat-only controls such as `temperature`, `maxOutputTokens`, `stopSequences`,
and reasoning settings are not sent to System One. Kortyx reports them through
`result.warnings` instead of silently pretending they changed the decision.

## 7. Streaming behavior

OpenRouter System One is non-streaming. If a caller requests a stream, Kortyx
performs one decision request and emits the completed serialized output as one
final result. Do not expect token-by-token text from Jev.

For normal use, omit `stream` and consume the typed `result.output` after the
hook resolves.

## 8. OpenRouter options supported by Jev

These OpenRouter-native controls are forwarded to System One when provided:

- `provider`
- `sessionId`
- `trace`
- `user`

```ts
const result = await useReason({
  model: openrouter("typesafe/jev-1.13"),
  input: ticket,
  outputSchema: TicketDecision,
  providerOptions: {
    openrouter: {
      sessionId: ticketId,
      user: accountId,
      provider: { zdr: true },
    },
  },
});
```

Other OpenRouter chat-only provider options produce an unsupported-option
warning and are not included in the System One request.

## 9. Model ids

Use a current OpenRouter Jev model id such as:

- `typesafe/jev-1.13`
- `~typesafe/jev-latest`
- `jev-latest`

Namespaced ids make the upstream provider explicit. Alias availability can
change, so use the model id chosen by the application rather than hard-coding a
catalog in shared framework code.

## Next steps

- Return to the [OpenRouter provider](./07-openrouter-provider.md) for chat
  models, routing, tools, and structured output
- See [Hooks](../02-core-concepts/07-hooks.md) for the complete `useReason(...)`
  contract
- See [Provider API](../05-reference/04-provider-api.md) for normalized result
  fields and warnings
