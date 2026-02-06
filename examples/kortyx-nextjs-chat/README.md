# @kortyx/example-nextjs-chat

Next.js chat app example for iterating on Kortyx packages locally.

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

## Configuration

- `GOOGLE_API_KEY` (or `GEMINI_API_KEY`): used by `@kortyx/providers` to initialize the Google provider.
- `kortyx.config.mjs` lives at the project root and points to `./src/workflows`.
- Workflows in this example are TypeScript (`defineWorkflow(...)`) under `src/workflows`.
