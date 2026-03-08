# Kortyx

Kortyx is an **AI agent orchestration framework** (work in progress).

- **GitHub (monorepo):** `kortyx-io/kortyx`
- **Packages (npm):** published from `packages/*` (scoped `@kortyx/*` + unscoped `kortyx`)
- **Apps:** `apps/website` (marketing/docs site), `apps/studio` (paid product in progress)

## Getting started (repo)

```bash
pnpm install
pnpm build
```

## Packages

- `packages/kortyx`: the “batteries included” meta-package
- `packages/core`: core primitives (types, config, base abstractions)
- `packages/runtime`: runtime/orchestrator wiring
- `packages/agent`: agent composition utilities
- `packages/providers`: LLM/provider integrations
- `packages/memory`: memory/state interfaces and implementations
- `packages/hooks`: lifecycle hooks and extensions
- `packages/stream`: streaming primitives
- `packages/utils`: shared utilities
- `packages/cli`: CLI tooling

Each package has its own README under its folder and is published to npm.

## Examples

- `examples/kortyx-nextjs-chat-api-route`: Next.js chat app example (API route method)
- `examples/kortyx-nextjs-chat-server-action`: Next.js chat app example (server action method)

## Contributing

See `CONTRIBUTING.md`.

## Security

See `SECURITY.md`.

## License

Apache-2.0 (see `LICENSE`).
