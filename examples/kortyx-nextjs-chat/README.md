# @kortyx/example-nextjs-chat-api-route

Next.js chat app example (API route method) for iterating on Kortyx packages locally.

## Run

```bash
cd examples/kortyx-nextjs-chat
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

2) Create `examples/kortyx-nextjs-chat/.env.local` from `examples/kortyx-nextjs-chat/.env.example` and set:

- `GOOGLE_API_KEY=...`
- `KORTYX_REDIS_URL=redis://127.0.0.1:6379`

3) Run the app:

```bash
pnpm dev
```

4) In the UI, set workflow override to `interrupt-demo`, trigger an interrupt (e.g. send `/multi` or any message for choice), then **stop and restart** the dev server and resume the interrupt from the UI.

## Reason + interrupt demo notes

Use workflow override `reason-interrupt-structured` to test `useReason` with:

- `outputSchema` (structured final output)
- `interrupt.requestSchema` / `interrupt.responseSchema`
- structured output streaming (`useStructuredData`)

LangGraph resumes by replaying the node function from the top. `useReason` continues from checkpoint, but code before it can re-run. This demo keeps the node minimal (`useReason` first) to avoid replay noise; if you need pre-`useReason` events, guard them with `useNodeState`.

## Configuration

- `GOOGLE_API_KEY` (or `GEMINI_API_KEY`): used by `createGoogleGenerativeAI(...)` in `src/lib/providers.ts`.
- Workflows in this example are TypeScript (`defineWorkflow(...)`) under `src/workflows`.
