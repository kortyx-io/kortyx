# @kortyx/google

[![npm version](https://img.shields.io/npm/v/@kortyx/google.svg)](https://www.npmjs.com/package/@kortyx/google)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/google.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

Google Gemini provider integration for Kortyx.

## Install

```bash
pnpm add @kortyx/google
```

```bash
npm install @kortyx/google
```

## Basic usage

```ts
import { google } from "@kortyx/google";
import { useReason } from "kortyx";

export const answerNode = async ({ input }: { input: unknown }) => {
  const result = await useReason({
    id: "answer",
    model: google("gemini-2.5-flash"),
    input: String(input ?? ""),
    stream: true,
    emit: true,
  });

  return {
    data: { text: result.text },
  };
};
```

The default `google` export reads one of these environment variables on first use:

- `GOOGLE_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `KORTYX_GOOGLE_API_KEY`
- `KORTYX_GEMINI_API_KEY`

If you want an app-local barrel, re-export it from a shared file:

```ts
// src/lib/providers.ts
export { google } from "@kortyx/google";
```

Then import from that file where you use it.

> Re-exporting `google` does not create a local binding in the same file. If you want to call `google("...")` in that file, use `import { google } from "@kortyx/google"`.

## Advanced usage

Use `createGoogleGenerativeAI(...)` when you want explicit app-owned setup or custom settings:

```ts
import { createGoogleGenerativeAI } from "@kortyx/google";

export const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});
```

## Reasoning, tools, and structured output

Model IDs accept arbitrary non-empty strings; `MODELS` supplies autocomplete suggestions. `useReason` preserves thought signatures and original function-call IDs across tool rounds and approval resumes. Thought summaries are kept separate from final text and JSON.

Compatible `outputSchema` calls use native JSON Schema enforcement. Tool schemas retain references and property names. Gemini 3 models receive `reasoning.effort` as a thinking level; Gemini 2.5 maps minimal/low/medium/high to budgets of 512/1,024/8,192/24,576 tokens, with a compatibility warning. Use `reasoning.maxTokens` for a specific budget, or `providerOptions.google.thinkingConfig` for native controls. Do not supply both generic effort and budget.

**Behavior change:** rejected reasoning settings now fail explicitly; Kortyx no longer retries without effort. `none` disables thinking on compatible Gemini 2.5 Flash models and fails on models that cannot disable thinking. No model is substituted automatically.

When combining tools with JSON output, `useReason` keeps output constraints off tool-selection turns. Gemini 2.x rejects the combined request, and live Gemini 3 `generateContent` tests repeatedly selected a tool instead of returning the final JSON. With only `outputSchema`, Kortyx reuses an answer that passes local validation and reports a compatibility warning. Otherwise it makes a separate JSON-only call, using the same model and reasoning and counting toward existing limits. An explicit `responseFormat.schema` always requires provider-enforced finalization. Direct Gemini 2.x requests combining tools and JSON fail with guidance.

See [Google thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures) and [structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).

## Documentation

- [Documentation](https://kortyx.io/docs)
- [Google provider guide](https://kortyx.io/docs/kortyx-providers/google-generative-ai-provider)
- [Choose a provider](https://kortyx.io/docs/kortyx-providers/choose-a-provider)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
