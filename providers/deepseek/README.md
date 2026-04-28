# @kortyx/deepseek

DeepSeek provider integration for Kortyx.

## Install

```bash
npm install @kortyx/deepseek
```

## Usage

```ts
import { createAgent, useReason } from "kortyx";
import { deepseek } from "@kortyx/deepseek";

const agent = createAgent({
  nodes: {
    answer: async () => {
      const result = await useReason({
        model: deepseek("deepseek-chat"),
        prompt: "Write a concise answer.",
      });

      return result;
    },
  },
});
```

Set `DEEPSEEK_API_KEY` or pass an explicit key:

```ts
import { createDeepSeek } from "@kortyx/deepseek";

export const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
});
```

## Models

Kortyx ships autocomplete for:

- `deepseek-chat`
- `deepseek-reasoner`

Arbitrary DeepSeek-compatible model IDs are accepted as strings.
