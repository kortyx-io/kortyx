# @kortyx/groq

[![npm version](https://img.shields.io/npm/v/@kortyx/groq.svg)](https://www.npmjs.com/package/@kortyx/groq)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/groq.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)

Groq provider integration for Kortyx.

## Install

```bash
pnpm add @kortyx/groq
```

```bash
npm install @kortyx/groq
```

## Usage

```ts
import { groq } from "@kortyx/groq";
import { useReason } from "kortyx";

export const answerNode = async ({ input }: { input: unknown }) => {
  const result = await useReason({
    id: "answer",
    model: groq("llama-3.3-70b-versatile"),
    input: String(input ?? ""),
    stream: true,
    emit: true,
  });

  return {
    data: { text: result.text },
  };
};
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

## Reasoning, tools, and structured output

Use a model supporting the requested combination, such as `openai/gpt-oss-120b` for reasoning and schema output. GPT-OSS cannot disable reasoning. Unsupported settings fail explicitly; no model or reasoning fallback is applied.

Groq does not currently support native schema output together with tools or streaming. When you provide only `outputSchema`, `useReason` runs tool rounds and reuses an answer that passes the original local validator, with a compatibility warning. This avoids an extra model call; two tool rounds plus a valid answer fit the default three steps. If validation fails, it makes a separate schema-only final request using the same model and reasoning settings. An explicit `responseFormat.schema` (including a model default) always requires that native finalization, even when the draft is valid. The extra request counts toward `toolExecution.maxSteps`, execution model-pass limits, usage and Studio telemetry; allow four steps for two tool rounds when finalization is needed. Approval/resume and cancellation cover finalization too. Schema-only responses are buffered even when `stream: true`.

Direct provider requests combining native schemas and tools fail with guidance. An explicit `providerOptions.groq.structuredOutputs: false` retains JSON mode plus local validation; Kortyx does not silently choose that weaker mode. `reasoningFormat: "raw"` cannot be combined with tools or JSON output.

See [Groq structured-output restrictions](https://console.groq.com/docs/structured-outputs).

## Documentation

- [Documentation](https://kortyx.io/docs)
- [Groq provider guide](https://kortyx.io/docs/kortyx-providers/groq-provider)
- [Choose a provider](https://kortyx.io/docs/kortyx-providers/choose-a-provider)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
