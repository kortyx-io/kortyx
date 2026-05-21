# @kortyx/google

[![npm version](https://img.shields.io/npm/v/@kortyx/google.svg)](https://www.npmjs.com/package/@kortyx/google)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/google.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

Google Gemini provider integration for Kortyx.

## Install

```bash
pnpm add @kortyx/google
```

```bash
npm install @kortyx/google
```

## Basic usage

```ts
import { google } from "@kortyx/google";
import { useReason } from "kortyx";

export const answerNode = async ({ input }: { input: unknown }) => {
  const result = await useReason({
    id: "answer",
    model: google("gemini-2.5-flash"),
    input: String(input ?? ""),
    stream: true,
    emit: true,
  });

  return {
    data: { text: result.text },
  };
};
```

The default `google` export reads one of these environment variables on first use:

- `GOOGLE_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `KORTYX_GOOGLE_API_KEY`
- `KORTYX_GEMINI_API_KEY`

If you want an app-local barrel, re-export it from a shared file:

```ts
// src/lib/providers.ts
export { google } from "@kortyx/google";
```

Then import from that file where you use it.

> Re-exporting `google` does not create a local binding in the same file. If you want to call `google("...")` in that file, use `import { google } from "@kortyx/google"`.

## Advanced usage

Use `createGoogleGenerativeAI(...)` when you want explicit app-owned setup or custom settings:

```ts
import { createGoogleGenerativeAI } from "@kortyx/google";

export const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});
```

## Documentation

- [Documentation](https://kortyx.io/docs)
- [Google provider guide](https://kortyx.io/docs/kortyx-providers/google-generative-ai-provider)
- [Choose a provider](https://kortyx.io/docs/kortyx-providers/choose-a-provider)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
