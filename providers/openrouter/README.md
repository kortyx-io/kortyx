# `@kortyx/openrouter`

OpenRouter provider integration for Kortyx. It uses OpenRouter's official,
OpenAPI-generated TypeScript SDK.

```bash
pnpm add @kortyx/openrouter
```

## Language models

```ts
import { openrouter } from "@kortyx/openrouter";
import { useReason } from "kortyx";

const result = await useReason({
  model: openrouter("anthropic/claude-sonnet-4.6"),
  input: "Summarize this ticket.",
});
```

The default export reads `OPENROUTER_API_KEY` or
`KORTYX_OPENROUTER_API_KEY` on first use. Use `createOpenRouter` for explicit
configuration:

```ts
import { createOpenRouter } from "@kortyx/openrouter";

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  appTitle: "Wolly",
  httpReferer: "https://workfully.com",
});
```

OpenRouter-specific request controls belong under
`providerOptions.openrouter`. Kortyx automatically enables
`provider.requireParameters` when a request uses function tools or a native
JSON schema, unless the caller explicitly chooses another value.

```ts
const model = openrouter("anthropic/claude-sonnet-4.6", {
  providerOptions: {
    openrouter: {
      provider: {
        zdr: true,
        allowFallbacks: true,
      },
      models: ["google/gemini-3.1-pro"],
    },
  },
});
```

## TypeSafe Jev decisions

Jev remains a normal model ref passed to `useReason`. Define its native
questions with `jevOutputSchema`, which is also the output validator and
provides full result type inference:

```ts
import { jevOutputSchema, openrouter } from "@kortyx/openrouter";
import { useReason } from "kortyx";

const TicketDecision = jevOutputSchema({
  queue: {
    type: "choice",
    instructions: "Which team should handle this request?",
    criteria: {
      billing: "Invoices, charges, or refunds",
      technical: "Bugs, outages, or login failures",
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
  input: "My invoice is wrong and I cannot sign in.",
  outputSchema: TicketDecision,
});

result.output?.queue; // "billing" | "technical"
result.output?.urgency; // number
result.output?.needsHuman; // probability from 0 to 1
```

Choice outputs are the selected key, score outputs are numbers, and `noul`
outputs retain Jev's probability rather than being thresholded to a boolean.
Full native answers, probabilities, and confidence remain available under
`result.providerMetadata.answers`; token usage is normalized on `result.usage`
and cost is retained as `result.providerMetadata.cost`.

Jev does not support tools and Kortyx rejects them before making a request.
Chat-only tuning options produce explicit warnings, and streaming is emulated
as one final result because System One is non-streaming.

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
