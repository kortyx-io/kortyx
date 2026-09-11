# @kortyx/deepseek

[![npm version](https://img.shields.io/npm/v/@kortyx/deepseek.svg)](https://www.npmjs.com/package/@kortyx/deepseek)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/deepseek.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

DeepSeek provider integration for Kortyx.

## Install

```bash
pnpm add @kortyx/deepseek
```

```bash
npm install @kortyx/deepseek
```

## Usage

```ts
import { deepseek } from "@kortyx/deepseek";
import { useReason } from "kortyx";

export const answerNode = async ({ input }: { input: unknown }) => {
  const result = await useReason({
    id: "answer",
    model: deepseek("deepseek-chat"),
    input: String(input ?? ""),
    stream: true,
    emit: true,
  });

  return {
    data: { text: result.text },
  };
};
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

## Reasoning and function tools

`useReason` preserves `reasoning_content` privately across tool rounds and approval resumes, including earlier assistant turns. Generic `reasoning.effort` is forwarded to the API's `reasoning_effort`; `none` disables thinking. Native controls remain available as `providerOptions.deepseek.thinking` and `providerOptions.deepseek.reasoningEffort`. Unsupported positive token budgets produce a warning.

DeepSeek JSON mode is accompanied by schema instructions and local validation; it is not advertised as native schema enforcement. Streamed function arguments are assembled before execution, and trailing usage does not erase the finish reason.

See [DeepSeek thinking and tool requirements](https://api-docs.deepseek.com/guides/thinking_mode/).

## Documentation

- [Documentation](https://kortyx.io/docs)
- [DeepSeek provider guide](https://kortyx.io/docs/kortyx-providers/deepseek-provider)
- [Choose a provider](https://kortyx.io/docs/kortyx-providers/choose-a-provider)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
