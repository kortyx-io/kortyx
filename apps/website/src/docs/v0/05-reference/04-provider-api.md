---
id: v0-provider-api
title: "Provider API"
description: "Reference the normalized Kortyx provider contract, provider instances, model refs, call options, and result metadata."
keywords: [kortyx, provider-api, providers, providerinstance, providermodelref, modeloptions]
sidebar_label: "Provider API"
---
# Provider API

`@kortyx/providers` is the shared contract package behind concrete provider packages such as `@kortyx/google`.

Most app code does not import this package directly. In normal app code, you usually:

1. import a provider package such as `@kortyx/google`
2. create or reuse a provider selector such as `google`
3. create a model ref with `google("gemini-2.5-flash")`
4. pass that model ref to `useReason(...)`

Use `@kortyx/providers` directly when you are:

- building a provider package
- writing provider-level tests
- working with registry helpers or normalized provider metadata

## Mental model

Kortyx providers are instance-based.

- A provider selector is both a callable function and a provider instance.
- Calling the selector returns a `ProviderModelRef`.
- The model ref carries the exact provider instance that should resolve the model.
- `useReason(...)` uses that instance directly.

That means Kortyx no longer depends on a global `"providerId" + "modelId"` lookup as the primary runtime path.

## Core types

```ts
import type {
  KortyxInvokeResult,
  KortyxModel,
  KortyxPromptMessage,
  KortyxStreamPart,
  ModelOptions,
  ProviderInstance,
  ProviderModelRef,
  ProviderSelector,
} from "@kortyx/providers";

type ProviderInstance = {
  id: string;
  models: readonly string[];
  getModel: (modelId: string, options?: ModelOptions) => KortyxModel;
};

type ProviderSelector = ProviderInstance & {
  (modelId: string, options?: ModelOptions): ProviderModelRef;
};

type ProviderModelRef = {
  provider: ProviderInstance;
  modelId: string;
  options?: ModelOptions;
};

type KortyxModel = {
  invoke(messages: KortyxPromptMessage[]): Promise<KortyxInvokeResult>;
  stream(messages: KortyxPromptMessage[]): AsyncIterable<KortyxStreamPart>;
};
```

```js
const provider = {
  id: "google",
  models: ["gemini-2.5-flash", "gemini-2.0-flash"],
  getModel(modelId, options) {
    return {
      async invoke(messages) {
        return { content: "..." };
      },
      async *stream(messages) {
        yield { type: "text-delta", delta: "..." };
        yield { type: "finish" };
      },
    };
  },
};

const modelRef = {
  provider,
  modelId: "gemini-2.5-flash",
  options: { temperature: 0.3 },
};
```

> **Good to know:** A model ref is configuration, not a live request. The actual provider-native model object is created later when `useReason(...)` resolves the ref through `provider.getModel(...)`.

## Normalized call options

These options are shared across providers through `ModelOptions`:

```ts
type ModelOptions = {
  temperature?: number;
  streaming?: boolean;
  maxOutputTokens?: number;
  stopSequences?: string[];
  abortSignal?: AbortSignal;
  reasoning?: {
    effort?: "minimal" | "low" | "medium" | "high" | string;
    maxTokens?: number;
    includeThoughts?: boolean;
  };
  responseFormat?:
    | { type: "text" }
    | { type: "json"; schema?: unknown; name?: string };
  providerOptions?: Record<string, unknown>;
};
```

```js
const abortController = new AbortController();

const modelOptions = {
  temperature: 0.3,
  streaming: true,
  maxOutputTokens: 800,
  stopSequences: ["</final>"],
  abortSignal: abortController.signal,
  reasoning: {
    effort: "medium",
    maxTokens: 256,
    includeThoughts: false,
  },
  responseFormat: { type: "json" },
  providerOptions: {},
};
```

These are normalized options, not a guarantee that every provider supports every field equally.

- If a provider supports an option, it should map it to the provider-native request.
- If a provider does not support a generic option yet, it should surface a warning instead of silently dropping it.

## Normalized invoke results

Every provider returns the same top-level result shape from `invoke(...)`:

```ts
type KortyxInvokeResult = {
  role?: "assistant";
  content: string;
  raw?: unknown;
  usage?: {
    input?: number;
    output?: number;
    total?: number;
    reasoning?: number;
    cacheRead?: number;
    cacheWrite?: number;
    raw?: Record<string, unknown>;
  };
  finishReason?: {
    unified:
      | "stop"
      | "length"
      | "content-filter"
      | "tool-calls"
      | "error"
      | "other";
    raw?: string;
  };
  warnings?: Array<
    | { type: "unsupported"; feature: string; details?: string }
    | { type: "compatibility"; feature: string; details?: string }
    | { type: "deprecated"; setting: string; message: string }
    | { type: "other"; message: string }
  >;
  providerMetadata?: Record<string, unknown>;
};
```

```js
const result = {
  content: "Draft email...",
  usage: {
    input: 142,
    output: 88,
    total: 230,
  },
  finishReason: {
    unified: "stop",
    raw: "STOP",
  },
  providerMetadata: {
    providerId: "google",
    modelId: "gemini-2.5-flash",
  },
  warnings: [],
};
```

Field meanings:

- `content`: final assistant text
- `raw`: provider-native payload for debugging or advanced inspection
- `usage`: normalized token usage when the provider exposes it
- `finishReason`: normalized stop reason plus raw provider reason when available
- `warnings`: compatibility or unsupported-feature warnings
- `providerMetadata`: provider-specific metadata that does not belong in the normalized top-level contract

## Normalized internal stream parts

Provider streaming uses typed internal parts:

```ts
type KortyxStreamPart =
  | {
      type: "text-delta";
      delta: string;
      raw?: unknown;
      providerMetadata?: Record<string, unknown>;
    }
  | {
      type: "finish";
      finishReason?: KortyxFinishReason;
      usage?: KortyxUsage;
      warnings?: KortyxWarning[];
      providerMetadata?: Record<string, unknown>;
      raw?: unknown;
    }
  | {
      type: "error";
      error: unknown;
      warnings?: KortyxWarning[];
      providerMetadata?: Record<string, unknown>;
      raw?: unknown;
    }
  | {
      type: "raw";
      raw: unknown;
      providerMetadata?: Record<string, unknown>;
    };
```

```js
for await (const part of model.stream(messages)) {
  if (part.type === "text-delta") {
    console.log(part.delta);
  }

  if (part.type === "finish") {
    console.log(part.usage, part.finishReason);
  }
}
```

> **Good to know:** These are internal provider-side stream parts. App-facing streaming still goes through `useReason(...)`, runtime orchestration, and `@kortyx/stream`.

## Registry helpers

`@kortyx/providers` still exports registry helpers:

- `createProviderRegistry()`
- `registerProvider(provider)`
- `resetProviders()`
- `getProvider(providerId)`
- `hasProvider(providerId)`
- `getInitializedProviders()`
- `getAvailableModels(providerId)`

Use the registry when you are writing tooling, tests, or low-level runtime code. In normal app code, prefer provider selectors and model refs from provider packages.

## Error behavior

Registry helpers fail fast:

- `getProvider(providerId)` throws if the provider is not registered
- provider packages should throw when the selected model id is unknown
- provider packages should throw clear configuration errors when required credentials are missing

That keeps misconfiguration visible early instead of producing vague runtime failures later.
