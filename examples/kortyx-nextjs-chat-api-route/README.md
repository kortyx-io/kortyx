# @kortyx/example-nextjs-chat-api-route

Next.js chat app example (API route method) for iterating on Kortyx packages locally.

## Run

```bash
cd examples/kortyx-nextjs-chat-api-route
pnpm install
GOOGLE_API_KEY=... # or GEMINI_API_KEY
KORTYX_NEXTJS_CHAT_PORT=3010 pnpm dev
```

## Test interrupt resume across server restart (Redis)

This example can run with **Redis-backed framework persistence** so interrupts can be resumed after restarting the server.

1) Start Redis (Docker):

```bash
pnpm redis:up
```

2) Create `examples/kortyx-nextjs-chat-api-route/.env.local` from `examples/kortyx-nextjs-chat-api-route/.env.example` and set:

- `GOOGLE_API_KEY=...`
- `KORTYX_REDIS_URL=redis://127.0.0.1:6379`

3) Run the app:

```bash
pnpm dev
```

4) In the UI, set workflow override to `interrupt-demo`, trigger an interrupt (e.g. send `/multi` or any message for choice), then **stop and restart** the dev server and resume the interrupt from the UI.

## Test sequential interrupts across resume

Use workflow override `interrupt-sequential-demo` to verify the multi-interrupt resume path.

1) Start the app.
2) In the UI, set workflow override to `interrupt-sequential-demo`.
3) Send any message to start the workflow.
4) Answer the first text interrupt.
5) Confirm the app immediately shows a second choice interrupt.
6) Pick an option and confirm the final message includes both the label and action.

Before the fix in `@kortyx/agent`, step 4 would hang because the resumed run reached a second `useInterrupt()` but never emitted a new interrupt chunk.

## Reason + interrupt demo notes

Use workflow override `reason-interrupt-structured` to test `useReason` with:

- `outputSchema` (structured final output)
- `interrupt.requestSchema` / `interrupt.responseSchema`
- structured output streaming (`useStructuredData`)

Resume replays the node function from the top. `useReason` continues from checkpoint, but code before it can re-run. This demo keeps the node minimal (`useReason` first) to avoid replay noise; if you need pre-`useReason` events, guard them with `useNodeState`.

## Configuration

- `GOOGLE_API_KEY` (or `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `KORTYX_GOOGLE_API_KEY`, `KORTYX_GEMINI_API_KEY`): used by the default `google` export from `@kortyx/google`.
- Workflows in this example are TypeScript (`defineWorkflow(...)`) under `src/workflows`.
