---
id: v0-package-overview
title: "Package Overview"
description: "Map each Kortyx package to its purpose and practical usage in app code."
keywords: [kortyx, package-overview, agent, runtime, core]
sidebar_label: "Package Overview"
---
# Package Overview

This page maps the current OSS packages in this monorepo.

## Recommended import strategy

- Server/runtime app code: import from `kortyx`
- Browser-safe low-level chunk helpers: import from `kortyx/browser`
- React client state and chat helpers: import from `@kortyx/react`

## Package map

| Package | Purpose | Typical consumers |
| --- | --- | --- |
| `kortyx` | batteries-included facade | application code |
| `@kortyx/react` | React client helpers (`useChat`, `useStructuredStreams`, transport/storage adapters) | React apps consuming streamed chat/structured state |
| `@kortyx/agent` | chat orchestration (`createAgent` + `agent.streamChat`) | app backend adapters |
| `@kortyx/core` | workflow + node + state contracts | workflow authors, framework users |
| `@kortyx/runtime` | graph execution + registries + framework adapters | advanced runtime integration |
| `@kortyx/hooks` | node hooks (`useReason`, state hooks, interrupts, structured data) | node authors |
| `@kortyx/providers` | provider contracts + registry | runtime/provider wiring |
| `@kortyx/google` | Google Gemini provider implementation | apps using Google models |
| `@kortyx/stream` | stream chunk types + SSE server/client helpers | web APIs + clients |
| `@kortyx/utils` | shared helpers (`deepMergeWithArrayOverwrite`, `withRetries`, `contentToText`) | framework internals |
| `@kortyx/cli` | CLI tooling (early stage) | CLI users |

## Notes about current implementation

- Providers: install provider packages per need (for example `@kortyx/google`).
- Business persistence: own it in your app; Kortyx only provides runtime/framework persistence.
- React apps should start with `@kortyx/react` before reaching for raw browser stream reducers.
- See [React Client](./06-react-client) for the recommended `useChat(...)` and `useStructuredStreams()` path.
- Stream structured-data schema currently has a built-in `jobs` discriminated type; apps may still emit custom structured payloads.
