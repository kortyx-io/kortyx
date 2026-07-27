# Kortyx Canvas

A standalone Next.js canvas-agent example built with Kortyx workflows, structured streaming, and interrupt handling.

```bash
pnpm --filter @kortyx/example-canvas dev
```

## Send telemetry to self-hosted Kortyx Studio

Start the repository development stack:

```bash
cp -n .env.example .env
docker compose up --build
```

In another shell, configure and run the canvas example:

```bash
cp -n examples/kortyx-canvas/.env.example examples/kortyx-canvas/.env.local
pnpm --filter @kortyx/example-canvas dev
```

The canvas example uses these telemetry env vars:

```bash
KORTYX_TELEMETRY_API_URL=http://localhost:6400
KORTYX_TELEMETRY_API_KEY=ktyx_test_localtelemetry_oss-demo-telemetry-secret-change-me
KORTYX_TELEMETRY_ENVIRONMENT=development
KORTYX_TELEMETRY_SERVICE_NAME=kortyx-canvas
```

Push the declared workflow topology before testing Studio. This is the
deterministic path Studio should rely on for the system map:

```bash
pnpm --filter @kortyx/example-canvas topology:push
```

To inspect the topology without writing to the API:

```bash
pnpm --filter @kortyx/example-canvas topology:dry-run
```

To verify canvas → API → DB → Studio without needing an LLM key:

```bash
pnpm --filter @kortyx/example-canvas smoke:studio
```

Then open Studio at `http://localhost:6300` with `admin` / `kortyx` and check
Runs/Workflows for `canvas-example-smoke`.

Real chat runs also emit telemetry when `GOOGLE_API_KEY` is configured and the
canvas chat API completes a request.
