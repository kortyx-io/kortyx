---
id: v0-provider-api
title: "Provider API"
description: "Reference provider contracts, registry helpers, and runtime error behavior."
keywords: [kortyx, provider-api, kortyxmodel, modeloptions, factory]
sidebar_label: "Provider API"
---
# Provider API

Provider contracts are exported from `@kortyx/providers`.

## Key types

```ts
interface ModelOptions {
  temperature?: number;
  streaming?: boolean;
}

interface KortyxModel {
  stream(messages: Array<HumanMessage | SystemMessage>): AsyncIterable<AIMessageChunk> | Promise<AsyncIterable<AIMessageChunk>>;
  invoke(messages: Array<HumanMessage | SystemMessage>): Promise<BaseMessage>;
  temperature: number;
  streaming: boolean;
}

type GetProviderFn = (
  providerId: string,
  modelId: string,
  options?: ModelOptions,
) => KortyxModel;
```

## Registry helpers

- `createProviderRegistry()`
- `registerProvider(config)`
- `resetProviders()`
- `getProvider(providerId, modelId, options?)`
- `hasProvider(providerId)`
- `getInitializedProviders()`
- `getAvailableModels(providerId)`

Concrete providers are delivered in dedicated packages (for example `@kortyx/google`).

## Error behavior

`getProvider` throws when:

- provider is not registered
- model id is unknown for the selected provider

This fail-fast behavior is useful during app startup and misconfiguration.
