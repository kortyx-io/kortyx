# @kortyx/mistral

[![npm version](https://img.shields.io/npm/v/@kortyx/mistral.svg)](https://www.npmjs.com/package/@kortyx/mistral)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/mistral.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

Mistral provider integration for Kortyx.

## Install

```bash
pnpm add @kortyx/mistral
```

```bash
npm install @kortyx/mistral
```

## Usage

```ts
import { mistral } from "@kortyx/mistral";
import { useReason } from "kortyx";

export const answerNode = async ({ input }: { input: unknown }) => {
  const result = await useReason({
    id: "answer",
    model: mistral("mistral-large-latest"),
    input: String(input ?? ""),
    stream: true,
    emit: true,
  });

  return {
    data: { text: result.text },
  };
};
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

## Documentation

- [Documentation](https://kortyx.io/docs)
- [Mistral provider guide](https://kortyx.io/docs/kortyx-providers/mistral-provider)
- [Choose a provider](https://kortyx.io/docs/kortyx-providers/choose-a-provider)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
