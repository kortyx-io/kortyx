# @kortyx/example-nextjs-chat

Next.js chat app example for iterating on Kortyx packages locally.

## Run

```bash
cd examples/kortyx-nextjs-chat
pnpm install
GOOGLE_API_KEY=... # or GEMINI_API_KEY
KORTYX_NEXTJS_CHAT_PORT=3010 pnpm dev
```

## Configuration

- `GOOGLE_API_KEY` (or `GEMINI_API_KEY`): used by `@kortyx/providers` to initialize the Google provider.
- `kortyx.config.mjs` lives at the project root and points to `./src/workflows`.
- Workflows in this example are declarative YAML files (`*.workflow.yml`).
