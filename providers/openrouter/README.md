# `@kortyx/openrouter`

OpenRouter provider integration for Kortyx. It uses OpenRouter's official,
OpenAPI-generated TypeScript SDK.

```bash
pnpm add @kortyx/openrouter "zod@^4.5.0"
```

Requires application-owned Zod `^4.5.0` as a peer dependency. Share the same
Zod version with your other Kortyx packages.

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
  appTitle: "Example Chat App",
  httpReferer: "https://example.com",
});
```

OpenRouter-specific request controls belong under
`providerOptions.openrouter`. Kortyx automatically enables
`provider.requireParameters` when a request uses function tools or a native
JSON schema, unless the caller explicitly chooses another value.

This is an all-parameter requirement: optional controls such as `temperature`
must also be supported by the selected endpoint. The default is unchanged.

Parameter-routing refusals use `PROVIDER_PARAMETER_UNSUPPORTED`. The safe failure
explains whether `requireParameters` was enabled automatically for tools/native
JSON schemas, explicitly configured by the caller, or left at the provider default.
It lists tool/output parameters (`response_format`, `tools`, `tool_choice`)
separately from other requested controls. These lists identify what was sent;
they do not claim which parameter caused the rejection or which controls your
application can safely omit.

Remove controls your application can omit, or choose a compatible route. The
error names this existing, explicit override when Kortyx enabled strict routing:

```ts
const model = openrouter("anthropic/claude-sonnet-4.6", {
  providerOptions: {
    openrouter: { provider: { requireParameters: false } },
  },
});
```

With that override, unsupported controls may be ignored, including tools and
structured output. Kortyx does not remove parameters or retry a modified request.

Preset aliases can add settings on OpenRouter's side. The diagnostic warns that
its list only covers parameters sent by Kortyx; it does not fetch or change
presets, publish customer-chosen preset/model names, or identify a requested alias
as the resolved model.

For developer debugging, the live exception preserves the original provider
message and original SDK error as `cause`, including its status, stack and
metadata. Public failure descriptors contain the safe explanation and allowlisted
parameter names, excluding prompts, parameter values and account routing data.
Numeric/string 404 codes and structured parameter-filter evidence are recognized;
unrelated 404s retain their existing classification. If the SDK rejects a malformed
response and no parameter refusal can be established, `PROVIDER_INVALID_RESPONSE`
retains the SDK parsing error. Partial stream usage is preserved.

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
