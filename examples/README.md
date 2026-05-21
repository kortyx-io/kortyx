# Examples

[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-examples-000000.svg)](https://nextjs.org/)

Runnable Kortyx examples for learning the framework and testing local package changes.

## Prerequisites

- Node.js 22+
- pnpm 10+
- A Google Gemini API key in `GOOGLE_API_KEY` or `GEMINI_API_KEY`

## @kortyx/example-nextjs-chat-api-route (API Route)

Streaming chat through a Next.js API route. This is the recommended first example for live chunked UI.

```bash
pnpm --filter @kortyx/example-nextjs-chat-api-route dev
```

- Path: [`examples/kortyx-nextjs-chat-api-route`](./kortyx-nextjs-chat-api-route)

## @kortyx/example-nextjs-chat-server-action (Server Action)

Buffered chat through a Next.js server action.

```bash
pnpm --filter @kortyx/example-nextjs-chat-server-action dev
```

- Path: [`examples/kortyx-nextjs-chat-server-action`](./kortyx-nextjs-chat-server-action)

## Production Behaviors Covered

- Provider setup with `@kortyx/google`.
- Agent and workflow wiring through `kortyx`.
- React streaming state with `@kortyx/react`.
- Human-in-the-loop interrupts.
- Redis-backed runtime persistence for restart/resume testing.

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
