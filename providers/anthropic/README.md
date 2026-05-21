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

This initial provider supports text `invoke` and streaming text output through
Anthropic's Messages API. Embeddings, images, and tool calls are outside the v1
Kortyx provider scope.

## Documentation

- [Documentation](https://kortyx.io/docs)
- [Anthropic provider guide](https://kortyx.io/docs/kortyx-providers/anthropic-provider)
- [Choose a provider](https://kortyx.io/docs/kortyx-providers/choose-a-provider)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
