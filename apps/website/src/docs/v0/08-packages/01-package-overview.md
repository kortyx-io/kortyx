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

- Default: import from `kortyx` for app code
- Use scoped packages only when you want lower-level control

## Package map

| Package | Purpose | Typical consumers |
| --- | --- | --- |
| `kortyx` | batteries-included facade | application code |
| `@kortyx/agent` | chat orchestration (`createAgent`, `processChat`) | app backend adapters |
| `@kortyx/core` | workflow + node + state contracts | workflow authors, framework users |
| `@kortyx/runtime` | graph execution + registries + framework adapters | advanced runtime integration |
| `@kortyx/hooks` | node hooks (`useAiProvider`, state hooks, interrupts) | node authors |
| `@kortyx/providers` | provider contracts + registry | runtime/provider wiring |
| `@kortyx/google` | Google Gemini provider implementation | apps using Google models |
| `@kortyx/memory` | business memory adapter contract + in-memory adapter | app persistence integration |
| `@kortyx/stream` | stream chunk types + SSE server/client helpers | web APIs + clients |
| `@kortyx/utils` | shared helpers (`deepMergeWithArrayOverwrite`, `withRetries`, `contentToText`) | framework internals |
| `@kortyx/cli` | CLI tooling (early stage) | CLI users |

## Notes about current implementation

- Providers: install provider packages per need (for example `@kortyx/google`).
- Memory adapters: in-memory is implemented; Redis/Postgres constructors exist but throw `not implemented yet`.
- Stream structured-data schema currently has a built-in `jobs` discriminated type; apps may still emit custom structured payloads.
