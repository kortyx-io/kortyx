# OpenRouter and TypeSafe Jev

Read this reference when an application uses `@kortyx/openrouter`, routes a
Claude/OpenAI/Gemini model through OpenRouter, or uses TypeSafe Jev.

## Choose the correct path

- For ordinary chat models, use `openrouter(modelId)` exactly like other Kortyx
  provider selectors and pass the ref to `useReason(...)`.
- For TypeSafe Jev, still use `openrouter(modelId)` with `useReason(...)`, but
  define the native questions with `jevOutputSchema(...)`.
- Do not invent or call an `openrouter.decide(...)` API. It is not part of the
  public provider contract.
- Do not treat OpenRouter access as proof that every routed model supports every
  option. Tools, JSON Schema, reasoning, streaming, and media remain
  model-and-route capabilities.

## OpenRouter chat models

```ts
import { openrouter } from "@kortyx/openrouter";
import { useReason } from "kortyx";

const result = await useReason({
  model: openrouter("anthropic/claude-sonnet-4.6"),
  input: "Summarize this support ticket.",
  temperature: 0.2,
  maxOutputTokens: 800,
  stream: true,
  emit: true,
});
```

The same selector accepts arbitrary non-empty OpenRouter model ids, including
OpenAI, Anthropic, Google, Mistral, DeepSeek, and other catalog entries. The
catalog changes continuously, so do not copy a static model list into app or
skill guidance.

The default provider reads `OPENROUTER_API_KEY` or
`KORTYX_OPENROUTER_API_KEY` on first use. Use `createOpenRouter(...)` for an
explicit API key, `baseUrl`, attribution headers, application categories, or a
custom `fetch`. Keep that setup on the server.

Use generic `useReason(...)` fields for normalized concerns. Put native routing
controls under `providerOptions.openrouter`:

```ts
const model = openrouter("anthropic/claude-sonnet-4.6", {
  providerOptions: {
    openrouter: {
      models: ["google/gemini-3.1-pro"],
      provider: { zdr: true, allowFallbacks: true },
      sessionId: "support-session-42",
    },
  },
});
```

When tools or an inferred JSON schema are used, Kortyx defaults
`provider.requireParameters` to `true` unless the caller overrides it. This
keeps OpenRouter from choosing a route that does not accept required request
parameters. Do not maintain a second package-level capability registry; use
OpenRouter validation/metadata and test the exact production route.

Prefer normalized `text`, `output`, `usage`, `finishReason`, `warnings`, and
`providerMetadata`. OpenRouter-reported cost is retained in
`providerMetadata.cost` and emitted as provider-reported USD pricing for
Studio. Use `raw` only for provider-specific diagnostics.

## TypeSafe Jev

Jev is a System One decision model, not a text generator. Keep the normal
`useReason(...)` invocation shape and use the helper as `outputSchema`:

```ts
import { jevOutputSchema, openrouter } from "@kortyx/openrouter";
import { useReason } from "kortyx";

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
    criteria: ["Can wait", "Important", "Customer is blocked"],
  },
  needsHuman: {
    type: "noul",
    instructions: "Does this require a human response?",
  },
});

const result = await useReason({
  model: openrouter("typesafe/jev-1.13"),
  input: ticket,
  outputSchema: TicketDecision,
});
```

The helper uses the official question shapes and infers the simplified output:

- `choice` becomes the selected criterion key as a string-literal union.
- `score` becomes a number from zero to the last level index and may be
  fractional. Define 2–10 ordered criteria.
- `noul` remains the probability of yes from zero to one. Do not convert it to
  a boolean inside the provider; the application owns its threshold.

Use `result.output` for normal branching. Native probabilities, legends, and
confidence remain in `result.providerMetadata.answers`; cost remains in
`result.providerMetadata.cost` and is emitted as provider-reported USD pricing
for Studio; token counts are normalized in `result.usage`.

## Jev compatibility rules

- Tools are a known hard incompatibility and fail locally before a request.
- Missing `jevOutputSchema(...)` metadata fails locally.
- Do not pass an explicit `responseFormat`; it would replace the helper's native
  System One schema and is rejected.
- `temperature`, `maxOutputTokens`, `stopSequences`, reasoning controls, and
  OpenRouter chat-only options do not affect Jev and are reported as warnings
  where the hook contract permits the call.
- System One is non-streaming. Kortyx can expose one completed result through
  the streaming contract, but there are no token deltas.
- Jev forwards only compatible native OpenRouter options: `provider`,
  `sessionId`, `trace`, and `user`.

Do not append JSON-output instructions manually. The helper marks the schema as
provider-native so `useReason(...)` sends the original input and the OpenRouter
adapter maps the questions to the System One request.

Supported model-id forms include namespaced and alias forms such as
`typesafe/jev-1.13`, `~typesafe/jev-latest`, and `jev-latest`. Treat aliases as
external catalog state rather than stable framework constants.
