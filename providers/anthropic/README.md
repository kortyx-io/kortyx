# @kortyx/anthropic

[![npm version](https://img.shields.io/npm/v/@kortyx/anthropic.svg)](https://www.npmjs.com/package/@kortyx/anthropic)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/anthropic.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

Anthropic provider integration for Kortyx.

## Install

```bash
pnpm add @kortyx/anthropic
```

```bash
npm install @kortyx/anthropic
```

## Usage

```ts
import { anthropic } from "@kortyx/anthropic";
import { useReason } from "kortyx";

export const answerNode = async ({ input }: { input: unknown }) => {
  const result = await useReason({
    id: "answer",
    model: anthropic("claude-sonnet-4-5"),
    input: String(input ?? ""),
    stream: true,
    emit: true,
  });

  return {
    data: { text: result.text },
  };
};
```

Set `ANTHROPIC_API_KEY` or pass an explicit key:

```ts
import { createAnthropic } from "@kortyx/anthropic";

export const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

## Models

Kortyx ships autocomplete for:

- `claude-sonnet-4-5`
- `claude-sonnet-4-5-20250929`
- `claude-haiku-4-5`
- `claude-haiku-4-5-20251001`
- `claude-opus-4-5`
- `claude-opus-4-5-20251101`
- `claude-sonnet-4-0`
- `claude-sonnet-4-20250514`
- `claude-opus-4-1`
- `claude-opus-4-1-20250805`
- `claude-3-haiku-20240307`

Arbitrary Anthropic model IDs are accepted as strings.

## Supported Scope

This provider supports text, reasoning, structured output, and function tools through
Anthropic's Messages API. Embeddings and image generation are outside the v1
Kortyx provider scope.

## Reasoning, tools, and structured output

`useReason` preserves signed thinking and redacted-thinking blocks privately across tool rounds and approval resumes. Current adaptive models use `thinking: { type: "adaptive" }` and native effort controls. Older manual-thinking models map minimal/low/medium/high to 1,024/2,048/8,192/16,384 tokens; use `reasoning.maxTokens` for a specific manual budget. `effort: "none"` disables thinking. Models that require adaptive thinking reject manual budgets explicitly.

For native overrides, use `providerOptions.anthropic.thinking` and `providerOptions.anthropic.effort`. Compatible `outputSchema` calls use native `output_config.format`; JSON mode or older models retain explicit compatibility warnings and local output validation. Empty `reasoning: {}` leaves model behavior unchanged. Older models retain the existing 1,024-token manual thinking budget for generic effort settings, with a compatibility warning; set `reasoning.maxTokens` to explicitly increase it. Existing `maxOutputTokens` behavior is retained: manual thinking budget is added to the requested answer budget. Unsupported native schema constraints are moved into descriptions with a compatibility warning, while `useReason` validates the original `outputSchema` locally. Direct provider callers must perform that local validation themselves. For adaptive thinking with tools, `useReason` keeps the native output schema off tool-selection turns. It reuses a locally valid final answer when only `outputSchema` was requested; otherwise it makes a schema-only final call within the existing limits. Explicit `responseFormat.schema` always requires that final provider-enforced call. This avoids live API failures observed with adaptive thinking, tools and native schemas in the same streaming request.

See [Anthropic thinking](https://platform.claude.com/docs/en/build-with-claude/thinking) and [structured output](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

## Documentation

- [Documentation](https://kortyx.io/docs)
- [Anthropic provider guide](https://kortyx.io/docs/kortyx-providers/anthropic-provider)
- [Choose a provider](https://kortyx.io/docs/kortyx-providers/choose-a-provider)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
