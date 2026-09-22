---
id: v0-openrouter-provider
title: "OpenRouter Provider"
description: "Use Claude, OpenAI, Gemini, and other OpenRouter chat models through the standard Kortyx provider shape."
keywords: [kortyx, openrouter, provider, claude, openai, gemini, routing]
sidebar_label: "OpenRouter"
---
# OpenRouter Provider

`@kortyx/openrouter` connects Kortyx to OpenRouter's multi-provider model
catalog through OpenRouter's official TypeScript SDK.

The application-facing shape is the same as the other Kortyx providers:

```ts
import { openrouter } from "@kortyx/openrouter";
import { useReason } from "kortyx";

const result = await useReason({
  model: openrouter("anthropic/claude-sonnet-4.6"),
  input: "Summarize this support ticket.",
});
```

## 1. Install the package

```bash tabs="install-openrouter" tab="pnpm"
pnpm add @kortyx/openrouter
```

```bash tabs="install-openrouter" tab="npm"
npm install @kortyx/openrouter
```

```bash tabs="install-openrouter" tab="yarn"
yarn add @kortyx/openrouter
```

```bash tabs="install-openrouter" tab="bun"
bun add @kortyx/openrouter
```

## 2. What the package exports

```ts
import {
  MODELS,
  PROVIDER_ID,
  createOpenRouter,
  openrouter,
} from "@kortyx/openrouter";
```

- `openrouter`: default provider selector
- `createOpenRouter(...)`: factory for explicit application-owned settings
- `PROVIDER_ID`: the provider id, currently `"openrouter"`
- `MODELS`: intentionally empty because OpenRouter's catalog changes
  continuously; the selector accepts arbitrary non-empty model ids

The package also exports `jevOutputSchema(...)`. That helper is specific to
TypeSafe Jev and is covered in [TypeSafe Jev through OpenRouter](./08-jev-openrouter.md).

## 3. Same usage shape as OpenAI

Only the provider selector and model id change:

```ts
import { openai } from "@kortyx/openai";
import { openrouter } from "@kortyx/openrouter";

const directOpenAI = openai("gpt-5.6-luna");
const routedOpenAI = openrouter("openai/gpt-5.6-luna");
const routedClaude = openrouter("anthropic/claude-sonnet-4.6");
const routedGemini = openrouter("google/gemini-3.1-pro");
```

All are regular Kortyx model refs passed to `useReason(...)`. Normalized call
fields keep the same shape:

```ts
const result = await useReason({
  model: openrouter("anthropic/claude-sonnet-4.6"),
  system: "Answer concisely.",
  input: ticket,
  temperature: 0.2,
  maxOutputTokens: 800,
  reasoning: { effort: "high" },
  tools,
  outputSchema,
  stream: true,
  emit: true,
});
```

The chosen OpenRouter model and provider route must support the features used
by the request. OpenRouter broadens model access; it does not make every model
support tools, structured output, reasoning, or media identically.

## 4. Credentials and explicit configuration

The default `openrouter` export reads credentials on first use from:

- `OPENROUTER_API_KEY`
- `KORTYX_OPENROUTER_API_KEY`

Use `createOpenRouter(...)` when the application owns configuration:

```ts
import { createOpenRouter } from "@kortyx/openrouter";

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  appTitle: "Wolly",
  httpReferer: "https://workfully.com",
});
```

Supported settings are `apiKey`, `baseUrl`, `appTitle`, `httpReferer`,
`appCategories`, and a custom `fetch` implementation. Keep all credentials and
provider construction on the server.

## 5. OpenRouter routing controls

Put OpenRouter-native request fields under `providerOptions.openrouter`:

```ts
const model = openrouter("anthropic/claude-sonnet-4.6", {
  providerOptions: {
    openrouter: {
      models: ["google/gemini-3.1-pro"],
      provider: {
        zdr: true,
        allowFallbacks: true,
      },
      sessionId: "support-session-42",
    },
  },
});
```

Generic Kortyx fields take precedence for normalized concerns such as
`temperature`, `maxOutputTokens`, `reasoning`, `responseFormat`, and `tools`.

When tools or a native JSON schema are present, Kortyx defaults OpenRouter's
`provider.requireParameters` to `true` unless the caller sets it explicitly.
This prevents a route from silently selecting an endpoint that does not accept
the required parameters.

## 6. Structured output and tools

Use the normal Kortyx APIs:

```ts
import { z } from "zod";

const Summary = z.object({
  category: z.string(),
  summary: z.string(),
});

const result = await useReason({
  model: openrouter("openai/gpt-5.6-luna"),
  input: ticket,
  tools: [lookupCustomer],
  outputSchema: Summary,
  stream: false,
});

result.output;
```

OpenRouter tool calls, streamed arguments, structured output, usage, and finish
reasons are normalized to the shared Kortyx contracts. Provider-native routing,
cost, cache, BYOK, and service-tier details remain available in
`result.providerMetadata` and `result.raw`.

## 7. Reasoning continuation

OpenRouter reasoning details are retained as private continuation state for
later model passes, including tool rounds. Application code should use the
normalized result fields instead of manually replaying provider-native
reasoning payloads.

## 8. Validation, warnings, and retries

- The official OpenRouter SDK validates request and response payloads.
- Kortyx reports normalized compatibility information through
  `result.warnings`.
- The SDK's independent retry loop is disabled so Kortyx owns retry policy.
- OpenRouter routing and fallback behavior remains controlled by the request's
  OpenRouter provider settings.

Kortyx intentionally does not publish a static model-capability registry. Use
OpenRouter's current model metadata and test the exact model and provider route
used in production.

## Supported scope

The adapter supports chat-model text generation through `useReason(...)`,
including streaming, function tools, structured output, reasoning controls,
and normalized usage when supported by the selected route.

Embeddings, image generation, audio, transcription, file APIs, and arbitrary
OpenRouter-hosted endpoints are not exposed by this provider adapter.

TypeSafe Jev is the provider-native exception: it uses OpenRouter's System One
endpoint while preserving the normal `useReason(...)` call shape. Continue with
[TypeSafe Jev through OpenRouter](./08-jev-openrouter.md) for its different
schema and compatibility rules.

## Next steps

- See [TypeSafe Jev through OpenRouter](./08-jev-openrouter.md) for typed
  decisions and probabilities
- See [Hooks](../02-core-concepts/07-hooks.md) for general `useReason(...)`
  behavior
- See [Provider API](../05-reference/04-provider-api.md) for the normalized
  provider contract
