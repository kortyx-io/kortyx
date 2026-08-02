# Kortyx

[![npm version](https://img.shields.io/npm/v/kortyx.svg)](https://www.npmjs.com/package/kortyx)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/kortyx.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D22-339933.svg)](./package.json)
[![pnpm](https://img.shields.io/badge/pnpm-10-f69220.svg)](https://pnpm.io/)

**Kortyx is a TypeScript framework for building production AI agents with explicit workflows, provider-agnostic models, typed hooks, streaming, interrupts, and runtime persistence.**

Use `kortyx` as the main package. It re-exports the public server/runtime APIs from the supporting `@kortyx/*` packages so application code can stay focused on workflows, nodes, providers, and UI transport.

## Why Kortyx

- **Explicit workflows:** define graph-shaped AI behavior instead of hiding orchestration in prompts.
- **Provider-agnostic models:** wire Google, OpenAI, Anthropic, DeepSeek, Groq, and Mistral behind one contract.
- **Runtime hooks:** call models with `useReason`, pause for humans with `useInterrupt`, and persist node/workflow state.
- **Streaming-first UX:** emit text, message, lifecycle, interrupt, and structured-data chunks over SSE.
- **Framework adapters:** run in Next.js API routes, server actions, custom HTTP handlers, or lower-level runtimes.
- **Operational visibility:** send structural telemetry to the self-hosted Kortyx Studio preview for runs, sessions, workflows, interrupts, timing, token usage, and cost review.

## Install

```bash
pnpm add kortyx @kortyx/google @kortyx/react
```

```bash
npm install kortyx @kortyx/google @kortyx/react
```

## Self-host Kortyx Studio

Kortyx Studio is a source-available observability interface for Kortyx SDK
applications. From any SDK project, with Docker running:

```bash
npx kortyx studio start
```

The command creates durable private state under `~/.kortyx/studio`, generates
the local sign-in and scoped API keys, starts the complete Docker stack, applies
migrations, and prints the server-side SDK telemetry variables. Retrieve the
same generated values later with:

```bash
npx kortyx studio credentials
```

Published images support `linux/amd64` and `linux/arm64`; Docker Desktop on
Apple Silicon selects the ARM64 image automatically. CLI-managed ports bind to
`127.0.0.1` by default.

Follow the canonical
[self-hosted preview guide](./docs/studio/self-hosted-preview.md) for SDK setup,
first-run verification, interrupt behavior, and common commands. Use the
[self-hosted operations guide](./docs/studio/self-hosted-operations.md) for
backup/restore, upgrades, reset, security, and troubleshooting.
Read the [first-preview release notes](./docs/releases/studio-self-hosted-preview.md)
for included and deferred capabilities.

Studio is source-available under Elastic License 2.0. The framework, CLI, and
telemetry API are Apache-2.0. See the [license boundary](./LICENSES.md).

### Repository development

To run Postgres, the API, Studio, and the canvas example from this repository:

```bash
pnpm dev
```

If you already manage Postgres yourself:

```bash
pnpm dev:no-db
```

The default dev `.env.example` uses host Postgres port `6543` to avoid
colliding with a local Postgres on `5432`. If you already had a `.env`, set
`POSTGRES_PORT=6543` and
`DATABASE_URL=postgres://kortyx:kortyx@localhost:6543/kortyx` manually.

After upgrading repository development data across projection changes:

```bash
pnpm db:migrate
pnpm db:backfill-studio
```

To test the image-based packaging stack from the repository:

```bash
cp -n .env.example .env
docker compose up --build
```

To send and verify one sample telemetry run:

```bash
docker compose --profile smoke up --abort-on-container-exit --exit-code-from smoke smoke
```

To verify a real Kortyx example producer end-to-end, run the canvas example in
another shell and point it at the Docker API:

```bash
cp -n examples/kortyx-canvas/.env.example examples/kortyx-canvas/.env.local
pnpm --filter @kortyx/example-canvas dev
pnpm --filter @kortyx/example-canvas smoke:studio
```

Then open Studio and check Runs/Workflows for `canvas-example-smoke`.

## Quickstart

Create a workflow:

```ts
// src/workflows/general-chat.workflow.ts
import { defineWorkflow } from "kortyx";
import { chatNode } from "@/nodes/chat.node";

export const generalChatWorkflow = defineWorkflow({
  id: "general-chat",
  version: "1.0.0",
  description: "Single-node chat workflow.",
  nodes: {
    chat: {
      run: chatNode,
      params: {
        temperature: 0.3,
      },
    },
  },
  edges: [
    ["__start__", "chat"],
    ["chat", "__end__"],
  ],
});
```

Add a server-side node:

```ts
// src/nodes/chat.node.ts
import { google } from "@kortyx/google";
import { useReason } from "kortyx";

type ChatParams = {
  temperature?: number;
};

export const chatNode = async ({
  input,
  params,
}: {
  input: unknown;
  params: ChatParams;
}) => {
  const result = await useReason({
    id: "chat",
    model: google("gemini-2.5-flash"),
    system: "You are a concise assistant.",
    input: String(input ?? ""),
    temperature: params.temperature ?? 0.3,
    stream: true,
    emit: true,
  });

  return {
    data: { text: result.text },
  };
};
```

Wire the agent:

```ts
// src/lib/agent.ts
import { createAgent } from "kortyx";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";

export const agent = createAgent({
  workflows: [generalChatWorkflow],
  defaultWorkflowId: "general-chat",
});
```

Expose it through a Next.js API route:

```ts
import { createChatRouteHandler } from "kortyx";
import { agent } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handleChat = createChatRouteHandler({ agent });

export async function POST(request: Request): Promise<Response> {
  return handleChat(request);
}
```

Consume the stream from React:

```tsx
"use client";

import { createRouteChatTransport, useChat } from "@kortyx/react";

export function Chat() {
  const chat = useChat({
    transport: createRouteChatTransport({ endpoint: "/api/chat" }),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        chat.send(String(form.get("message") ?? ""));
        event.currentTarget.reset();
      }}
    >
      {chat.messages.map((message) => (
        <p key={message.id}>{message.content}</p>
      ))}
      {chat.streamContentPieces.map((piece) =>
        piece.type === "text" ? (
          <span key={piece.id}>{piece.content}</span>
        ) : null,
      )}
      <input name="message" />
      <button type="submit" disabled={chat.isStreaming}>
        Send
      </button>
    </form>
  );
}
```

Set a provider key and run your app:

```bash
GOOGLE_API_KEY=your_key_here pnpm dev
```

## Provider Packages

Install only the provider integrations your app needs.

| Provider | Package | Factory | Default environment variable |
| --- | --- | --- | --- |
| Google Gemini | `@kortyx/google` | `google(...)` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| OpenAI | `@kortyx/openai` | `openai(...)` | `OPENAI_API_KEY` |
| Anthropic | `@kortyx/anthropic` | `anthropic(...)` | `ANTHROPIC_API_KEY` |
| DeepSeek | `@kortyx/deepseek` | `deepseek(...)` | `DEEPSEEK_API_KEY` |
| Groq | `@kortyx/groq` | `groq(...)` | `GROQ_API_KEY` |
| Mistral | `@kortyx/mistral` | `mistral(...)` | `MISTRAL_API_KEY` |

## Package Map

Most apps should import from `kortyx`, `@kortyx/react`, and one or more provider packages. The scoped packages are available for advanced users who want lower-level entry points.

| Package | Purpose |
| --- | --- |
| `kortyx` | Batteries-included public facade for server/runtime app code |
| `@kortyx/react` | React chat state, route transports, browser storage, and structured stream helpers |
| `@kortyx/agent` | Agent creation, chat handlers, route parsing, and stream orchestration |
| `@kortyx/core` | Workflow definitions, node contracts, state types, and validation |
| `@kortyx/hooks` | Node-level hooks for model calls, interrupts, structured data, and runtime state |
| `@kortyx/runtime` | Graph execution, node registries, workflow registries, and persistence adapters |
| `@kortyx/providers` | Provider contracts and registry shared by concrete provider packages |
| `@kortyx/stream` | Stream chunk protocol, SSE helpers, readers, collectors, and structured reducers |
| `@kortyx/utils` | Shared utility functions used by the framework packages |
| `@kortyx/cli` | CLI tooling entrypoint |

## Repository

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

| Path | Description |
| --- | --- |
| `packages/kortyx` | Main npm package |
| `packages/*` | Supporting framework packages |
| `providers/*` | Concrete model provider integrations |
| `apps/website` | Documentation and product website |
| `examples/*` | Runnable Next.js examples |
| `skills/kortyx` | Portable Kortyx agent skill instructions |

## Examples

- [`examples/kortyx-nextjs-chat-api-route`](./examples/kortyx-nextjs-chat-api-route): streaming Next.js API route integration.
- [`examples/kortyx-nextjs-chat-server-action`](./examples/kortyx-nextjs-chat-server-action): server action integration with buffered responses.

## Documentation

- [Documentation](https://kortyx.io/docs)
- [Package overview](https://kortyx.io/docs/reference/package-overview)
- [Quickstart: Next.js API Route](https://kortyx.io/docs/getting-started/quickstart-nextjs)
- [Quickstart: Next.js Server Action](https://kortyx.io/docs/getting-started/quickstart-nextjs-server-action)
- [Runtime persistence](https://kortyx.io/docs/production/persistence)
- [Provider guide](https://kortyx.io/docs/kortyx-providers/choose-a-provider)

## Security

Please report security issues through the process in [SECURITY.md](./SECURITY.md).

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](./CONTRIBUTING.md), run the full local checks, and keep package changes scoped to the relevant workspace.

## License

Kortyx uses a mixed licensing model:

- Apache-2.0 for the framework, provider, CLI, telemetry API, examples, and
  website code
- Elastic License 2.0 for the source-available Studio UI in `apps/studio`
- Per-plugin terms for `plugins/*`, defined by each plugin's `LICENSE.md`

See [LICENSES.md](./LICENSES.md) for the repository-wide boundaries and the
applicable license texts.
