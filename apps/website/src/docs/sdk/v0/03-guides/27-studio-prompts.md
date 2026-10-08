---
id: v0-studio-prompt-sdk
title: "Use Studio Prompts"
description: "Resolve typed prompt versions, preserve chat roles, and attach execution and eval evidence."
keywords: [kortyx, usePrompt, definePrompt, prompts, studio]
sidebar_label: "Studio Prompts"
---
# Use Studio prompts

`definePrompt` defines the application contract. Templates and saved configuration
live in Studio; the reference object contains the stable key, format, and Zod
contracts. `usePrompt` fills template variables and returns ordered messages,
validated configuration, and immutable identity.

```ts
import { createAgent, createPrompts, definePrompt, studioPromptSource, usePrompt, useReason } from "kortyx";
import { openrouter } from "@kortyx/openrouter";
import { z } from "zod";

const classifyIntent = definePrompt({
  id: "canvas/classify-intent",
  format: "system-user",
  variables: z.object({ message: z.string() }),
  config: z.object({
    modelName: z.enum(["fast", "accurate"]),
    temperature: z.number().min(0).max(2),
  }),
});
const models = {
  fast: openrouter("openai/gpt-4o-mini"),
  accurate: openrouter("openai/gpt-4o"),
};
const prompts = createPrompts({
  definitions: [classifyIntent],
  source: studioPromptSource({
    apiUrl: process.env.KORTYX_API_URL!,
    apiKey: process.env.KORTYX_PROMPTS_API_KEY!,
    environment: "production",
    // projectId: "...", // optional explicit cloud project
  }),
});
const agent = createAgent({ ...agentOptions, prompts });

// Inside a workflow node:
const prompt = await usePrompt(classifyIntent, {
  variables: { message: userMessage },
});
const result = await useReason({
  prompt,
  model: models[prompt.config.modelName],
  temperature: prompt.config.temperature,
});
```

A system-user version contains exactly one system message followed by one user
message. `useReason({ prompt })` preserves both. With `format: "chat"`, it preserves
all system, user, and assistant messages in their stored order, including few-shot
examples. Tools and output/interrupt contracts remain normal `useReason` options.
Do not combine `prompt` with `input`, `system`, or `messages` in the same call.

Configuration is separate from template variables: `{{message}}` uses the supplied
`variables.message`; `prompt.config.modelName` is a saved value your code maps to
a model registry. The SDK does not instantiate arbitrary providers from Studio.
Both Studio JSON Schema and application Zod contracts must accept the values.
The returned compiled prompt is frozen; construct it with `usePrompt`, rather
than deserializing or mutating its identity.

## Execution consistency and failure policy

All registered references resolve in one atomic snapshot per execution. Parallel
nodes and child calls share it. Checkpoints retain the template snapshot, so resume
and fork keep the selected versions while rendering new runtime variables.
`version: 2` explicitly pins an immutable version. Eval snapshots are authoritative:
a conflicting explicit pin fails instead of silently bypassing the candidate.

Serving defaults to fail closed. `fallback: "last-known-good"` on `createPrompts`
allows a previously verified snapshot during transient failures, bounded by
`maxStaleMs` (default five minutes). Optional `cache` implements asynchronous
`get(key)`/`set(key, snapshot)` for durable storage. Keys include API source,
credential identity/project, and environment. Authorization, contract, hash, and
dependency failures do not silently fall back. Serving requests have bounded
timeouts and retries. Keep serving credentials server-side with `prompt:serve`.

`@kortyx/prompts` also exports `localPromptSource` for an immutable local snapshot.
It validates hashes and dependency closure through the same protocol. Prompt
groups belong to Studio's test-launch selection and need no SDK interface.

## Runs and evals

Pass the same agent to `createEvals`. Its manifest advertises registered prompt
contracts, enabling Studio to test candidates or groups with the existing suite
drawer. Actual model calls emit prompt identity receipts. Requested-but-unused or
mismatched candidates cannot satisfy verified promotion evidence. The optional
`@kortyx/telemetry` adapter attaches the key/version/hash/environment to normal
generation events; message capture follows its existing capture settings.

The runnable [`examples/kortyx-prompts`](https://github.com/kortyx-io/kortyx/tree/main/examples/kortyx-prompts)
includes the complete server, model registry, telemetry, and authenticated eval
endpoint. See [Version and test prompts](../../../studio/v0/13-prompts.md) and
[CLI migration](../../../studio/v0/14-prompt-migration.md).
