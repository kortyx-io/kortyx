# @kortyx/groq

Groq provider integration for Kortyx.

## Install

```bash
npm install @kortyx/groq
```

## Usage

```ts
import { createAgent, useReason } from "kortyx";
import { groq } from "@kortyx/groq";

const agent = createAgent({
  nodes: {
    answer: async () => {
      const result = await useReason({
        model: groq("llama-3.3-70b-versatile"),
        prompt: "Write a concise answer.",
      });

      return result;
    },
  },
});
```

Set `GROQ_API_KEY` or pass an explicit key:

```ts
import { createGroq } from "@kortyx/groq";

export const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});
```

## Models

Kortyx ships autocomplete for:

- `llama-3.1-8b-instant`
- `llama-3.3-70b-versatile`
- `openai/gpt-oss-120b`
- `openai/gpt-oss-20b`
- `qwen/qwen3-32b`

Arbitrary Groq-compatible model IDs are accepted as strings.
