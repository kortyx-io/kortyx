# @kortyx/mistral

Mistral provider integration for Kortyx.

## Install

```bash
npm install @kortyx/mistral
```

## Usage

```ts
import { createAgent, useReason } from "kortyx";
import { mistral } from "@kortyx/mistral";

const agent = createAgent({
  nodes: {
    answer: async () => {
      const result = await useReason({
        model: mistral("mistral-large-latest"),
        prompt: "Write a concise answer.",
      });

      return result;
    },
  },
});
```

Set `MISTRAL_API_KEY` or pass an explicit key:

```ts
import { createMistral } from "@kortyx/mistral";

export const mistral = createMistral({
  apiKey: process.env.MISTRAL_API_KEY,
});
```

## Models

Kortyx ships autocomplete for:

- `ministral-3b-latest`
- `ministral-8b-latest`
- `ministral-14b-latest`
- `mistral-large-latest`
- `mistral-medium-latest`
- `mistral-large-2512`
- `mistral-medium-2508`
- `mistral-medium-2505`
- `mistral-small-2506`
- `mistral-small-latest`
- `mistral-small-2603`
- `magistral-medium-latest`
- `magistral-small-latest`
- `magistral-medium-2509`
- `magistral-small-2509`
- `pixtral-large-latest`

Arbitrary Mistral model IDs are accepted as strings.
