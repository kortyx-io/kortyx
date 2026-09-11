---
id: v0-openai-provider
title: "OpenAI Provider"
description: "Use OpenAI models in Kortyx with the batteries-included openai export or an explicit provider instance."
keywords: [kortyx, openai, provider, gpt, o-series]
sidebar_label: "OpenAI"
---
# OpenAI Provider

`@kortyx/openai` uses the OpenAI Responses API by default. The same provider also supports Chat Completions through an explicit transport option.

It gives you two entry points:

- `openai`: a batteries-included default provider selector
- `createOpenAI(...)`: an explicit factory for custom setup

## 1. Install the package

```bash tabs="install-openai-provider" tab="pnpm"
pnpm add @kortyx/openai
```

```bash tabs="install-openai-provider" tab="npm"
npm install @kortyx/openai
```

```bash tabs="install-openai-provider" tab="yarn"
yarn add @kortyx/openai
```

```bash tabs="install-openai-provider" tab="bun"
bun add @kortyx/openai
```

## 2. What the package exports

```ts
import { MODELS, PROVIDER_ID, createOpenAI, openai } from "@kortyx/openai";
```

```js
import { MODELS, PROVIDER_ID, createOpenAI, openai } from "@kortyx/openai";
```

What each export is for:

- `openai`: default provider selector for the fastest start
- `createOpenAI(...)`: custom provider instance with explicit settings
- `MODELS`: built-in OpenAI model ids exposed by the package
- `PROVIDER_ID`: the provider id string, currently `"openai"`

## 3. Basic usage in the same file

```ts
import { openai } from "@kortyx/openai";

const model = openai("gpt-4.1-mini");
```

```js
import { openai } from "@kortyx/openai";

const model = openai("gpt-4.1-mini");
```

`openai` is a provider selector, which means:

- it is callable: `openai("gpt-4.1-mini")`
- it also exposes provider metadata: `openai.id`, `openai.models`

```ts
openai.id; // "openai"
openai.models; // readonly list of built-in model ids
```

```js
openai.id; // "openai"
openai.models; // readonly list of built-in model ids
```

> **Good to know:** The built-in model list gives autocomplete, but arbitrary OpenAI model ids are accepted as strings.

## 4. Shared app bootstrap usage

If you want one shared import path across your app, re-export `openai` from a bootstrap file such as `src/lib/providers.ts`.

```ts
// src/lib/providers.ts
export { openai } from "@kortyx/openai";
```

```js
// src/lib/providers.js
export { openai } from "@kortyx/openai";
```

Then import it from that file where you actually use it:

```ts
// src/nodes/chat.node.ts
import { openai } from "@/lib/providers";
```

```js
// src/nodes/chat.node.js
import { openai } from "@/lib/providers";
```

## 5. Advanced usage with explicit settings

Use `createOpenAI(...)` when you want app-owned configuration instead of the default environment-based setup.

```ts
import { createOpenAI } from "@kortyx/openai";

export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

```js
import { createOpenAI } from "@kortyx/openai";

export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

Use the factory when you need to:

- pass `apiKey` explicitly
- use a custom `baseUrl`
- provide a custom `fetch`

## 6. Credentials and first-use behavior

The default `openai` export resolves credentials on first use, not at import time.

Supported environment variables:

- `OPENAI_API_KEY`
- `KORTYX_OPENAI_API_KEY`

If neither variable is set and you did not pass `apiKey` to `createOpenAI(...)`, the provider throws a configuration error the first time an OpenAI model is actually used.

## 7. Create model refs for workflow and node params

```ts
params: {
  model: openai("gpt-4.1-mini"),
  temperature: 0.3,
}
```

```js
params: {
  model: openai("gpt-4.1-mini"),
  temperature: 0.3,
}
```

You can also attach default model options to the ref itself:

```ts
const model = openai("gpt-4.1-mini", {
  temperature: 0.2,
  maxOutputTokens: 800,
});
```

```js
const model = openai("gpt-4.1-mini", {
  temperature: 0.2,
  maxOutputTokens: 800,
});
```

Those become default options for later `useReason(...)` calls unless you override them at call time.

## 8. Use the model with `useReason(...)`

```ts
import { useReason } from "kortyx";
import { openai } from "@/lib/providers";

const result = await useReason({
  model: openai("gpt-4.1-mini"),
  input: "Write a concise launch update for our beta users.",
  temperature: 0.3,
  emit: true,
  stream: true,
});

result.text;
result.usage;
result.finishReason;
result.providerMetadata;
result.warnings;
```

```js
import { useReason } from "kortyx";
import { openai } from "@/lib/providers";

const result = await useReason({
  model: openai("gpt-4.1-mini"),
  input: "Write a concise launch update for our beta users.",
  temperature: 0.3,
  emit: true,
  stream: true,
});

result.text;
result.usage;
result.finishReason;
result.providerMetadata;
result.warnings;
```

> **Good to know:** Provider setup is not done on `createAgent(...)`. Model selection happens where you call `useReason(...)` by passing a model ref.

## 9. Supported normalized call options

Use reasoning, executable function tools, and structured output together without configuring a transport:

```ts
import { openai } from "@kortyx/openai";
import { useReason, type KortyxExecutableTool } from "kortyx";
import { z } from "zod";

const lookup: KortyxExecutableTool = {
  name: "lookup",
  description: "Read the current task status",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  execute: async (_input, context) => {
    const response = await fetch("https://your-api.example/task", {
      signal: context.abortSignal,
    });
    if (!response.ok) throw new Error(`Lookup failed: ${response.status}`);
    return response.json();
  },
};

// Inside a workflow node:
const result = await useReason({
  model: openai("gpt-5.6-luna"),
  input: "Look up the task and explain its status.",
  reasoning: { effort: "medium" },
  tools: [lookup],
  outputSchema: z.object({ status: z.string(), explanation: z.string() }),
  stream: false,
});

result.output; // Validated { status, explanation }
```

`stream: true` also supports function tools. For incremental structured fields, configure `structured.fields` using the existing hook API. Tool rounds, approvals and execution-limit resumes preserve completed results and provider continuation. Pass the tool context's `abortSignal` to your own I/O so root cancellation can stop it cooperatively.

For compatible Zod object schemas, `outputSchema` automatically supplies the provider JSON schema. Custom validators, transforms, optional properties and dynamic object keys use JSON mode plus local validation and an `outputSchema` compatibility warning. Supply an explicit `responseFormat` to control the wire format. An explicit format always wins; local validation still runs.

Responses maps `maxOutputTokens` to `max_output_tokens`, `reasoning.effort` to `reasoning.effort`, and JSON output to `text.format`. The output budget includes reasoning tokens. Unsupported `stopSequences`, `reasoning.maxTokens`, and `reasoning.includeThoughts` fail explicitly. Temperature is omitted with a warning when the reasoning model/effort does not support it.

Provider options belong under `providerOptions.openai`: `api`, `reasoningEffort`, `maxCompletionTokens`, `serviceTier`, `store`, `metadata`, `systemMessageMode`, `structuredOutputs`, and `strictJsonSchema`. Call options override corresponding model defaults. Unknown options produce warnings. There is no automatic model, reasoning-effort, or transport retry/fallback after a provider error.

## 10. Transport selection and migration

Earlier releases used Chat Completions by default. To retain that transport, including for compatible third-party gateways:

```ts
import { createOpenAI, openai } from "@kortyx/openai";

const legacy = createOpenAI({ api: "chat-completions" });
const legacyModel = legacy("gpt-4.1-mini");

// Or override just one model:
const model = openai("gpt-4.1-mini", { api: "chat-completions" });

// A model can also override a provider's default:
const reasoningModel = legacy("gpt-5.6-luna", { api: "responses" });
```

Keep importing from `@kortyx/openai`; there is no separate legacy package. Check that custom `baseUrl` gateways expose `/responses` before using the new default. Chat Completions retains its existing option mapping and model restrictions; selecting it does not make unsupported reasoning/function-tool combinations work.

Responses defaults to `store: false`. Kortyx replays required reasoning and function-call items, including encrypted reasoning content, from server-owned runtime state. It does not depend on `previous_response_id` or provider-hosted conversation storage. Keep checkpoint storage private. Internal continuation is excluded from client stream events and automatic telemetry content capture. Applications explicitly exporting `result.raw` remain responsible for handling that provider-native payload.

`result.raw` now has the selected transport's native shape. Prefer `output`, `text`, `usage`, `finishReason` and `providerMetadata` for transport-independent code. Update all affected Kortyx workspace packages together when consuming this change from source.

## 11. Usage, errors, and Studio

`providerMetadata.api` identifies the selected transport. Responses also reports response ID, status, reasoning settings and service tier. Studio displays these alongside finish reason and input, output, reasoning and cached-token counts. Older event payloads remain readable.

OpenAI's output-token count already includes reasoning tokens; cached input is a subset of input. Kortyx records these relationships so total tokens and cost do not count them twice. Usage reported by an incomplete/failed response remains charged to the failed execution. Refusals, malformed responses, provider failures, and streams missing a terminal response never become successful results. No usage is invented when the provider supplies none.

The built-in Luna price card covers standard-tier requests up to 272,000 input tokens. Configure a project rate for other tiers/context sizes; they remain unpriced without one.

## Supported scope

Text generation, executable function tools, structured output, streaming and non-streaming execution are supported through Responses and Chat Completions. OpenAI-hosted tools, embeddings, image generation, audio, transcription and file APIs are not exposed by this transport addition.

## Available built-in OpenAI model ids

- `gpt-5.6-luna`
- `gpt-5.4`
- `gpt-5.4-mini`
- `gpt-5.4-nano`
- `gpt-5.4-pro`
- `gpt-4.1`
- `gpt-4.1-mini`
- `gpt-4o`
- `gpt-4o-mini`
- `o4-mini`

## Next steps

- See [Hooks](../02-core-concepts/07-hooks.md) for `useReason(...)` behavior and structured output
- See [Provider API](../05-reference/04-provider-api.md) for the shared normalized provider contract
