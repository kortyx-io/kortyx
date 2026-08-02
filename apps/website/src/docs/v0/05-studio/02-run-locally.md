---
id: v0-studio-run-locally
title: "Run Kortyx Studio Locally"
description: "Start Kortyx Studio with Docker, connect a Kortyx application, and inspect its first run."
keywords: [kortyx, studio, docker, local, quickstart, telemetry]
sidebar_label: "Run Studio Locally"
---
# Run Kortyx Studio Locally

This is the shortest path from a working Kortyx SDK application to its first observable run.

By the end, you will have:

1. Studio, the telemetry API, and PostgreSQL running through Docker;
2. one server-side Kortyx agent connected; and
3. a run visible at `http://localhost:6300`.

## Before you start

You need:

- Node.js 22 or newer;
- npm 10 or newer;
- Docker Engine with Docker Compose v2, or a current Docker Desktop; and
- free local ports `6300` for Studio and `6400` for the telemetry API.

Linux containers on AMD64 and ARM64 are supported. Docker Desktop on Apple Silicon selects the ARM64 images automatically.

## 1. Start Studio

Run this from your Kortyx SDK project:

```bash
npx kortyx studio start
```

The first start can take a few minutes while Docker downloads the images. The command then migrates and bootstraps PostgreSQL, starts the services, waits for health checks, and prints the connection details.

```text
Kortyx Studio connection
  Studio:   http://localhost:6300
  API:      http://localhost:6400
  Username: admin
  Password: <generated-password>

Add these server-side variables to your Kortyx SDK project:
  KORTYX_TELEMETRY_API_URL=http://localhost:6400
  KORTYX_TELEMETRY_API_KEY=ktyx_live_...
  KORTYX_TELEMETRY_ENVIRONMENT=development
  KORTYX_TELEMETRY_SERVICE_NAME=my-agent
```

The exact secret values are unique to your installation.

> **Keep them private:** Local credentials are stored under `~/.kortyx/studio`. Do not commit the generated `.env` file or expose a telemetry key through a browser bundle.

## 2. Connect your application

Install the Studio telemetry adapter:

```bash tabs="studio-telemetry-install" tab="pnpm"
pnpm add @kortyx/telemetry
```

```bash tabs="studio-telemetry-install" tab="npm"
npm install @kortyx/telemetry
```

```bash tabs="studio-telemetry-install" tab="yarn"
yarn add @kortyx/telemetry
```

```bash tabs="studio-telemetry-install" tab="bun"
bun add @kortyx/telemetry
```

Copy the four `KORTYX_TELEMETRY_*` values printed by the CLI into the **server-only** environment of your application. Then create the telemetry adapter once and attach it to your agent.

```ts tabs="studio-agent-setup" tab="TypeScript" file="src/lib/agent.ts"
import { createAgent } from "kortyx";
import { createKortyxTelemetryAdapter } from "@kortyx/telemetry";

const telemetry = createKortyxTelemetryAdapter({
  endpoint: process.env.KORTYX_TELEMETRY_API_URL!,
  apiKey: process.env.KORTYX_TELEMETRY_API_KEY!,
  environment:
    process.env.KORTYX_TELEMETRY_ENVIRONMENT ?? "development",
  service: {
    name: process.env.KORTYX_TELEMETRY_SERVICE_NAME ?? "my-agent",
  },
});

export const agent = createAgent({
  workflows,
  telemetry,
});
```

```js tabs="studio-agent-setup" tab="JavaScript" file="src/lib/agent.js"
import { createAgent } from "kortyx";
import { createKortyxTelemetryAdapter } from "@kortyx/telemetry";

const telemetry = createKortyxTelemetryAdapter({
  endpoint: process.env.KORTYX_TELEMETRY_API_URL,
  apiKey: process.env.KORTYX_TELEMETRY_API_KEY,
  environment:
    process.env.KORTYX_TELEMETRY_ENVIRONMENT ?? "development",
  service: {
    name: process.env.KORTYX_TELEMETRY_SERVICE_NAME ?? "my-agent",
  },
});

export const agent = createAgent({
  workflows,
  telemetry,
});
```

For a fuller explanation of identifiers and content capture, see [Connect Your Project](./03-connect-project.md).

## 3. See your first run

1. Restart your application so it reads the new environment values.
2. Trigger any request that executes the Kortyx agent.
3. Open [http://localhost:6300](http://localhost:6300).
4. Sign in with the username and password printed by the CLI.
5. Open **Runs** and select the new run.

You are connected when the run appears. Studio can now explain the workflow path, model calls, timing, token usage, interrupts, and captured payloads available for that execution.

## If the run does not appear

Check the installation before changing application code:

```bash
npx kortyx studio status
npx kortyx studio logs --no-follow
```

Then verify:

- the API URL and key are available to the server process that creates the agent;
- the application was restarted after its environment changed;
- the telemetry API is reachable from that server process; and
- the Runs time filter includes the current time.

An `Invalid telemetry API key` error means the application or Studio is presenting a key that does not match the verifier in this installation. Print the current values with `npx kortyx studio credentials`; if you intentionally rotate them, update every affected server process.

## Next steps

- Learn the local lifecycle commands in [CLI Commands](./04-cli-commands.md).
- Decide whether payload content may be captured in [Connect Your Project](./03-connect-project.md#choose-what-content-studio-may-store).
- Read [Operations and Troubleshooting](./07-operations.md) before backup, reset, or upgrade.
- Use [Deploy on a Server](./06-deploy-server.md) when Studio must be reachable beyond your machine.
