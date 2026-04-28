# @kortyx/anthropic

Anthropic provider integration for Kortyx.

## Install

```bash
npm install @kortyx/anthropic
```

## Usage

```ts
import { createAgent, useReason } from "kortyx";
import { anthropic } from "@kortyx/anthropic";

const agent = createAgent({
  nodes: {
    answer: async () => {
      const result = await useReason({
        model: anthropic("claude-sonnet-4-5"),
        prompt: "Write a concise project update.",
      });

      return result;
    },
  },
});
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
