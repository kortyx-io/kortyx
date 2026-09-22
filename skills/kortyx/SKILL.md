---
name: kortyx
description: Use when building, reviewing, documenting, testing, or architecting apps with Kortyx. Covers providers, useReason/useTool tools, model-driven interrupts, supervisor and specialist composition, child workflows, execution limits, typed failures, runtime persistence, Studio debugging, React chat hydration, and streamed UI behavior.
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
8. Before preserving version-specific claims, inspect the installed package exports and CLI `--help`. Do not carry old child-workflow, persistence, or Studio implementation details into current guidance without checking them.

## Error handling

For catching, displaying or persisting failures, custom route errors, provider retries, or schema correction, read [references/error-handling.md](references/error-handling.md). It covers shared helpers, safe domain errors, transport fields and legacy compatibility. Verify the installed package exports before using the new API; keep recovery policy application-owned and propagate control flow.

## Topic Router

Architecture:

- `references/response-completion.md`: completeResponse, background continuation, host lifetime, scoped listInterrupts/getInterrupt discovery and independent approval interfaces.

- `references/workflow-execution.md`: typed `agent.execute` / `agent.resume`, separate HTTP entry points, outcomes, cancellation signals, shared execution limits/Continue, durable human approval, and conversational regression testing.

- `references/architecture-folder-structure.md`: default layouts and responsibility boundaries.
- `references/architecture-workflows-and-nodes.md`: defining workflows, nodes, return shapes, routing, and agent wiring.
- `references/architecture-supervisor-specialists.md`: coordinator-per-turn routing, returning specialist workflows, one reason/tool loop per specialist, prompt boundaries, and conversational output.
- `references/architecture-nextjs.md`: Next.js API route vs Server Action guidance.
- `references/architecture-react-node.md`: separate React frontend plus Node backend.
- `references/architecture-runtime-persistence.md`: memory, Redis, PostgreSQL, PostgreSQL-plus-Redis, and app DB boundaries.
- `references/session-checkpoints-rollback-fork.md`: adding checkpoint, rollback, fork, regenerate, undo, and structured-data cleanup features to apps built with Kortyx.
- `references/observability-otel.md`: backend-neutral server-side OpenTelemetry tracing, prompt metadata, tags, and trace ids on the React client.
- `references/observability-langfuse.md`: app-owned Langfuse export, Kortyx attribute mapping, Next.js flush lifecycle, optional prompt linking, and client feedback scores.

Studio:

- `references/studio-local-development.md`: starting Studio locally, connecting server-side SDK telemetry, publishing a workflow catalog, and verifying the first real run.
- `references/studio-agent-debugging.md`: analyzing Studio run/session/interrupt URLs through the read-only CLI, connection selection, branch-aware evidence, and capture limitations.

Hooks:

- `references/hooks-use-tool.md`: the complete executable-tool contract, direct/model execution choice, safe failures, denial classification, abort/cleanup ownership, telemetry, replay, and Studio discovery.

- `references/hooks-child-workflows.md`: typed child calls, `parallel` groups, approval timing, output contracts, interrupt/replay safety, fork/rollback, and migration from handoffs.
- `references/hooks-use-reason.md`: model calls, provider imports/options, local and MCP-derived tools, plural model-driven interrupts, schema output, and text streaming.
- `references/hooks-interrupts-and-state.md`: human-in-the-loop flows, resume, replay, and persistence implications.
- `references/hooks-structured-streaming.md`: choosing `useReason({ structured })` vs `useStructuredData(...)`.
- `references/hooks-runtime-context.md`: passing request context safely from route/client to nodes.

React client:

- `references/react-use-chat.md`: chat state, storage, lifecycle controls, message preparation.
- `references/react-rendering.md`: finalized messages vs active stream pieces.
- `references/react-transports.md`: route transport, custom transports, abort support.
- `references/react-interrupts.md`: built-in/custom human input pieces, contract
  request rendering, and selected/text/value responses.

## Core Rules

- Prefer a coordinator that chooses a registered specialist workflow per turn. Call it with `useWorkflow(...)`, let the specialist make one `useReason(...)` call with its tools and optional interrupt contracts, then return to the coordinator. Avoid application-written tool-loop state machines.
- Use `useWorkflow(...)` for registered child calls that return to their caller. Read `references/hooks-child-workflows.md` before implementing call contracts or replay behavior; no special call edges are needed.
- For response completion/background human review, read `references/response-completion.md`; keep useInterrupt unchanged and Studio optional/read-only.
- Use Next.js API routes or a Node HTTP backend for live SSE streaming.
- Use Server Actions only for buffered/non-live flows.
- Put provider credentials/configuration, `createAgent(...)`, workflows, nodes, and runtime persistence on the server.
- Use `@kortyx/react` for React chat clients unless the task needs lower-level stream primitives.
- Store product/business data in the app DB or service layer, not Kortyx runtime persistence.
- Treat user-facing rollback/fork as session-level runtime state, not transcript replay. Do not implement regenerate by only truncating client messages and resending text.
- Choose runtime persistence explicitly: memory for local/single-process use, Redis for shared TTL-oriented runtime state, PostgreSQL for authoritative durable history, or PostgreSQL plus Redis for durable storage with a payload cache. This storage is separate from the app database.
- Keep OpenTelemetry tracing server-side and use generic Kortyx telemetry metadata.
- Treat OpenTelemetry as the Kortyx observability contract. Keep backend exporters such as Langfuse app-owned.
- Treat Studio as an observer: publish declared topology with `kortyx topology push`, and verify run telemetry with a real application request instead of a synthetic workflow.
- Keep Studio API keys and all `KORTYX_TELEMETRY_*` configuration server-side.
- `useReason({ outputSchema, structured.fields })` already streams known structured fields as `structured-data` chunks; do not confuse those with raw model JSON `text-delta` chunks.
- `useReason({ tools })` accepts `KortyxExecutableTool[]`: directly imported local tools, request-bound tools, and MCP-derived tools from `createMCPClient(...).tools()`. `useReason` closes owned request-scoped resources by default.
- Tools and model-driven human input share the same durable `useReason` loop. Define one or more contracts with `defineInterruptContract`, pass them under `interrupts.contracts`, choose `mode`, bound human turns with `maxRequests`, and read `result.interruptHistory`.
- The singular `useReason({ interrupt })` option and `result.interruptResponse` are deprecated and removed in the next major; do not use them in new code.
- Import provider selectors from their provider packages, such as `google` from `@kortyx/google` and `openai` from `@kortyx/openai`, not from `kortyx`.
- `useChat(...)` does not accept `sessionId`. Hydrate an existing session and visible history through `ChatStorage`; when the server owns history, keep it authoritative and send only the current turn or an app-approved summary/context.

## Done Criteria

- Client, route/API, agent, workflows, nodes, providers, and persistence have clear boundaries.
- Hook choice matches the node behavior.
- Deterministic calls use `useTool`; model-selected calls use `useReason({ tools })`,
  with the complete executable-tool ownership and failure contract preserved.
- Interrupt/resume code is replay-safe.
- New model-driven interrupts use named plural contracts and value-based client
  responses; deprecated singular fields appear only in migration notes.
- Child workflows use inferred schema contracts, stable call IDs, and the parent checkpoint/transport; verification covers their actual interrupt and fork paths.
- Rollback/fork features restore server-side workflow state and invalidate stale structured data.
- Production rollback/fork guidance includes persistence choice, retention, and in-memory limitations.
- Streaming clients render finalized history and active stream pieces separately.
- Existing chat sessions hydrate through `ChatStorage`; server-owned history stays
  authoritative.
- Public error UI uses safe failure descriptors, while raw diagnostics stay in
  trusted server/observability paths.
- Sensitive auth context is derived on the server.
- Studio integrations, when requested, publish the real workflow catalog and verify a real run separately.
