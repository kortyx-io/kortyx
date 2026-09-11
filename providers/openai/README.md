# @kortyx/openai

[![npm version](https://img.shields.io/npm/v/@kortyx/openai.svg)](https://www.npmjs.com/package/@kortyx/openai)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/openai.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

OpenAI provider integration for Kortyx. Uses Responses by default, including reasoning with executable function tools and structured output.

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

## Transport and migration

`useReason({ model: openai("gpt-5.6-luna"), reasoning: { effort: "medium" }, tools, outputSchema, stream: false })` uses Responses automatically. Compatible Zod object schemas are inferred; custom validators still run locally and return a compatibility warning when wire-schema inference is unavailable.

Keep Chat Completions explicitly when needed:

```ts
const legacy = createOpenAI({ api: "chat-completions" });
const model = openai("gpt-4.1-mini", { api: "chat-completions" });
```

This changes the default endpoint from `/chat/completions` to `/responses`. Custom gateways must support it or select Chat Completions. `raw` remains transport-specific. Responses uses `store: false`, preserves tool/reasoning continuation privately across rounds, and never silently downgrades effort or retries another model. See the provider guide for option differences and migration details.

## Live verification

After building the workspace, export `OPENAI_API_KEY` and run:

```sh
KORTYX_RUN_OPENAI_E2E=1 pnpm --filter @kortyx/example-nextjs-chat-api-route exec vitest run test/openai-responses.real.test.ts
```

These opt-in tests make billable calls to `gpt-5.6-luna` (and one legacy `gpt-4.1-mini` check). They cover dependent function calls, structured output in both stream modes, approval and limit resume, root/child cancellation, incomplete output and explicit provider errors. Ordinary CI skips them. Set `KORTYX_TEST_REDIS_URL` to a disposable local Redis instance to also verify approval/resume through newly created Redis adapters. To verify local Studio ingestion too, set `KORTYX_RUN_OPENAI_STUDIO_E2E=1` with `KORTYX_API_URL`, `KORTYX_TELEMETRY_API_KEY`, and `KORTYX_STUDIO_API_KEY`.

## Models

Kortyx ships autocomplete for:

- `gpt-5.6-luna`
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
