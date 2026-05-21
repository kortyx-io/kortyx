# @kortyx/example-nextjs-chat-server-action

[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-Server%20Action-000000.svg)](https://nextjs.org/)

Next.js chat app example using a Kortyx server action integration.

Use this variant when you want server-action ergonomics and can accept buffered responses instead of live token/chunk streaming.

## Run

```bash
pnpm --filter @kortyx/example-nextjs-chat-server-action dev
```

Set `GOOGLE_API_KEY` or `GEMINI_API_KEY` in the environment before starting the app.

## Test interrupt resume across server restart (Redis)

This example can run with **Redis-backed framework persistence** so interrupts can be resumed after restarting the server.

1. Start Redis (Docker):

```bash
pnpm --filter @kortyx/example-nextjs-chat-server-action redis:up
```

2. Create `examples/kortyx-nextjs-chat-server-action/.env.local` from `examples/kortyx-nextjs-chat-server-action/.env.example` and set:

- `GOOGLE_API_KEY=...`
- `KORTYX_REDIS_URL=redis://127.0.0.1:6379`

3. Run the app:

```bash
pnpm --filter @kortyx/example-nextjs-chat-server-action dev
```

4. In the UI, set workflow override to `interrupt-demo`, trigger an interrupt (e.g. send `/multi` or any message for choice), then **stop and restart** the dev server and resume the interrupt from the UI.

## Reason + interrupt demo notes

Use workflow override `reason-interrupt-structured` to test `useReason` with:

- `outputSchema` (structured final output)
- `interrupt.requestSchema` / `interrupt.responseSchema`
- structured output streaming (`useStructuredData`)

Resume replays the node function from the top. `useReason` continues from checkpoint, but code before it can re-run. This demo keeps the node minimal (`useReason` first) to avoid replay noise; if you need pre-`useReason` events, guard them with `useNodeState`.

## Configuration

- `GOOGLE_API_KEY` (or `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `KORTYX_GOOGLE_API_KEY`, `KORTYX_GEMINI_API_KEY`): used by the default `google` export from `@kortyx/google`.
- Workflows in this example are TypeScript (`defineWorkflow(...)`) under `src/workflows`.

## Stack

- `kortyx` for workflow, agent, hooks, runtime, and stream APIs.
- `@kortyx/google` for Gemini models.
- `@kortyx/react` for browser chat state.
- Redis for optional runtime persistence during restart/resume testing.

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
