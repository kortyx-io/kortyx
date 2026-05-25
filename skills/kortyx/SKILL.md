---
name: kortyx
description: Use when building, reviewing, documenting, or architecting apps with Kortyx. Covers Kortyx hooks, useReason, interrupts, structured streaming, runtime context, Next.js API routes and server actions, separate React + Node apps, folder structure, runtime persistence, @kortyx/react, useChat, transports, and streamed chat rendering.
---

# Kortyx

Use this skill when a task involves using Kortyx correctly in an application.

## First Checks

1. Inspect the target app, route/API handler, agent setup, workflows, and nodes before changing behavior.
2. Keep Kortyx runtime execution on the server.
3. Preserve existing app structure unless the user asks for a restructure; map Kortyx responsibilities into the closest existing folders.
4. Keep `SKILL.md` as the router. Load only the reference file that matches the task.
5. Treat this skill as self-contained; do not require local Kortyx source files to use it.
6. If network access is available and current details matter, prefer the official docs at `https://kortyx.io/docs` and source at `https://github.com/kortyx-io/kortyx`.
7. If the local app has Kortyx docs, examples, package README files, or existing Kortyx integration code, prefer those over inventing new patterns.

## Topic Router

Architecture:

- `references/architecture-folder-structure.md`: default layouts and responsibility boundaries.
- `references/architecture-workflows-and-nodes.md`: defining workflows, nodes, return shapes, routing, and agent wiring.
- `references/architecture-nextjs.md`: Next.js API route vs Server Action guidance.
- `references/architecture-react-node.md`: separate React frontend plus Node backend.
- `references/architecture-runtime-persistence.md`: in-memory vs Redis and app DB boundaries.
- `references/observability-otel.md`: server-side OpenTelemetry tracing, prompt metadata, and backend-neutral adapter setup.

Hooks:

- `references/hooks-use-reason.md`: model calls, provider options, MCP tools, schema output, and text streaming.
- `references/hooks-interrupts-and-state.md`: human-in-the-loop flows, resume, replay, and persistence implications.
- `references/hooks-structured-streaming.md`: choosing `useReason({ structured })` vs `useStructuredData(...)`.
- `references/hooks-runtime-context.md`: passing request context safely from route/client to nodes.

React client:

- `references/react-use-chat.md`: chat state, storage, lifecycle controls, message preparation.
- `references/react-rendering.md`: finalized messages vs active stream pieces.
- `references/react-transports.md`: route transport, custom transports, abort support.
- `references/react-interrupts.md`: responding to human input pieces.

## Core Rules

- Use Next.js API routes or a Node HTTP backend for live SSE streaming.
- Use Server Actions only for buffered/non-live flows.
- Put provider credentials/configuration, `createAgent(...)`, workflows, nodes, and runtime persistence on the server.
- Use `@kortyx/react` for React chat clients unless the task needs lower-level stream primitives.
- Store product/business data in the app DB or service layer, not Kortyx runtime persistence.
- Keep OpenTelemetry tracing server-side and use generic Kortyx telemetry metadata.
- `useReason({ outputSchema, structured.fields })` already streams known structured fields as `structured-data` chunks; do not confuse those with raw model JSON `text-delta` chunks.
- MCP tools are passed to `useReason({ tools, toolExecution })` from `createMCPClient(...).tools()`. `useReason` closes request-scoped MCP clients by default.
- Do not combine `useReason({ tools })` with normal `useReason({ interrupt })`; use `toolExecution.approval` for tool approval, or split tools and user input into separate hook calls/nodes.

## Done Criteria

- Client, route/API, agent, workflows, nodes, providers, and persistence have clear boundaries.
- Hook choice matches the node behavior.
- Interrupt/resume code is replay-safe.
- Streaming clients render finalized history and active stream pieces separately.
- Sensitive auth context is derived on the server.
