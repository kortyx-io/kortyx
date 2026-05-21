# @kortyx/openai

[![npm version](https://img.shields.io/npm/v/@kortyx/openai.svg)](https://www.npmjs.com/package/@kortyx/openai)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/openai.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

OpenAI provider integration for Kortyx.

## Install

```bash
pnpm add @kortyx/openai
```

```bash
npm install @kortyx/openai
```

## Usage

```ts
import { openai } from "@kortyx/openai";
import { useReason } from "kortyx";

export const answerNode = async ({ input }: { input: unknown }) => {
  const result = await useReason({
    id: "answer",
    model: openai("gpt-4.1-mini"),
    input: String(input ?? ""),
    stream: true,
    emit: true,
  });

  return {
    data: { text: result.text },
  };
};
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

## Documentation

- [Documentation](https://kortyx.io/docs)
- [OpenAI provider guide](https://kortyx.io/docs/kortyx-providers/openai-provider)
- [Choose a provider](https://kortyx.io/docs/kortyx-providers/choose-a-provider)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
