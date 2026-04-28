# @kortyx/openai

OpenAI provider integration for Kortyx.

## Install

```bash
npm install @kortyx/openai
```

## Usage

```ts
import { createAgent, useReason } from "kortyx";
import { openai } from "@kortyx/openai";

const agent = createAgent({
  nodes: {
    answer: async () => {
      const result = await useReason({
        model: openai("gpt-4.1-mini"),
        prompt: "Write a concise answer.",
      });

      return result;
    },
  },
});
```

Set `OPENAI_API_KEY` or pass an explicit key:

```ts
import { createOpenAI } from "@kortyx/openai";

export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

## Models

Kortyx ships autocomplete for:

- `gpt-5.4`
- `gpt-5.4-mini`
- `gpt-5.4-nano`
- `gpt-5.4-pro`
- `gpt-4.1`
- `gpt-4.1-mini`
- `gpt-4o`
- `gpt-4o-mini`
- `o4-mini`

Arbitrary OpenAI model IDs are accepted as strings.
