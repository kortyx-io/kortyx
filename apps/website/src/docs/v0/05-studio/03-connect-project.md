---
id: v0-studio-connect-project
title: "Connect Your Kortyx Project"
description: "Configure server-side Kortyx telemetry, stable service identity, and deliberate content capture for Studio."
keywords: [kortyx, studio, telemetry, project, sdk, content-capture]
sidebar_label: "Connect Your Project"
---
# Connect Your Kortyx Project

Connect Studio at the agent boundary. One telemetry adapter can observe the sessions, runs, workflows, nodes, model calls, and interrupts produced by that agent.

> **Prerequisite:** Start a local installation with [Run Studio Locally](./02-run-locally.md), or obtain the telemetry API URL and Project-scoped write key from the operator of your remote deployment.

## Install the adapter

```bash tabs="connect-studio-install" tab="pnpm"
pnpm add @kortyx/telemetry
```

```bash tabs="connect-studio-install" tab="npm"
npm install @kortyx/telemetry
```

```bash tabs="connect-studio-install" tab="yarn"
yarn add @kortyx/telemetry
```

```bash tabs="connect-studio-install" tab="bun"
bun add @kortyx/telemetry
```

## Configure the server environment

```bash file=".env.local"
KORTYX_TELEMETRY_API_URL=http://localhost:6400
KORTYX_TELEMETRY_API_KEY=ktyx_live_...
KORTYX_TELEMETRY_ENVIRONMENT=development
KORTYX_TELEMETRY_SERVICE_NAME=my-agent
```

| Variable | Meaning |
| --- | --- |
| `KORTYX_TELEMETRY_API_URL` | Reachable base URL of the telemetry API |
| `KORTYX_TELEMETRY_API_KEY` | Project-scoped `telemetry:write` key |
| `KORTYX_TELEMETRY_ENVIRONMENT` | Informational label such as `development` or `production` |
| `KORTYX_TELEMETRY_SERVICE_NAME` | Stable name for this SDK application or agent service |

Do not prefix these variables with `NEXT_PUBLIC_`, `VITE_`, or another mechanism that exposes them to client code.

## Attach telemetry to the agent

```ts tabs="connect-studio-agent" tab="TypeScript" file="src/lib/agent.ts"
import { createAgent } from "kortyx";
import { createKortyxTelemetryAdapter } from "@kortyx/telemetry";
import { workflows } from "./workflows";

const telemetry = createKortyxTelemetryAdapter({
  endpoint: process.env.KORTYX_TELEMETRY_API_URL!,
  apiKey: process.env.KORTYX_TELEMETRY_API_KEY!,
  environment:
    process.env.KORTYX_TELEMETRY_ENVIRONMENT ?? "development",
  service: {
    name: process.env.KORTYX_TELEMETRY_SERVICE_NAME ?? "my-agent",
  },
});

export const agent = createAgent({ workflows, telemetry });
```

```js tabs="connect-studio-agent" tab="JavaScript" file="src/lib/agent.js"
import { createAgent } from "kortyx";
import { createKortyxTelemetryAdapter } from "@kortyx/telemetry";
import { workflows } from "./workflows.js";

const telemetry = createKortyxTelemetryAdapter({
  endpoint: process.env.KORTYX_TELEMETRY_API_URL,
  apiKey: process.env.KORTYX_TELEMETRY_API_KEY,
  environment:
    process.env.KORTYX_TELEMETRY_ENVIRONMENT ?? "development",
  service: {
    name: process.env.KORTYX_TELEMETRY_SERVICE_NAME ?? "my-agent",
  },
});

export const agent = createAgent({ workflows, telemetry });
```

Keep the service name stable across deploys. Use the environment field as an informative label; it does not create a separate security or storage boundary.

## Choose what content Studio may store

Structural telemetry is useful without storing prompts or responses. Input and output content are excluded by default.

Enable only the content your application is permitted to export:

```ts tabs="studio-content-capture" tab="TypeScript" file="src/lib/agent.ts"
const telemetry = createKortyxTelemetryAdapter({
  endpoint: process.env.KORTYX_TELEMETRY_API_URL!,
  apiKey: process.env.KORTYX_TELEMETRY_API_KEY!,
  captureContent: {
    input: true,
    output: false,
  },
});
```

```js tabs="studio-content-capture" tab="JavaScript" file="src/lib/agent.js"
const telemetry = createKortyxTelemetryAdapter({
  endpoint: process.env.KORTYX_TELEMETRY_API_URL,
  apiKey: process.env.KORTYX_TELEMETRY_API_KEY,
  captureContent: {
    input: true,
    output: false,
  },
});
```

| Setting | Data that may be included |
| --- | --- |
| `input: true` | User/application inputs and submitted interrupt responses |
| `output: true` | Model/application outputs, interrupt questions, and static option labels |
| Both `false` | Structural lifecycle, timing, model identity, token usage, and status only |

Option values and resume tokens are never sent as telemetry. Review retention, access, and regulatory requirements before enabling content capture in production.

## Interrupt behavior in Studio

Studio observes interrupt lifecycle events; your application still presents the request and sends the resume response.

- Pending interrupt state expires after 15 minutes by default.
- Configure the application TTL with `KORTYX_FRAMEWORK_TTL_MS`, or with `frameworkAdapter.ttlMs`.
- Studio derives **Expired** from the durable `expiresAt` timestamp.
- A late response cannot resume the expired run, although application fallback may handle it as a new run.
- A dynamic picker may correctly report zero embedded options because the client resolves choices from its own data source.

For runtime behavior and replay-safe side effects, read [Interrupts and Resume](../03-guides/02-interrupts-and-resume.md).

## Verify the connection

Trigger one agent request and open **Runs** in Studio. If nothing arrives, use this order:

1. Confirm the application server has all four environment variables.
2. Confirm it restarted after configuration changed.
3. Check the Studio stack with `npx kortyx studio status`.
4. Inspect recent logs with `npx kortyx studio logs --no-follow`.
5. Confirm the Studio time filter includes the event.

For remote deployments, also verify network reachability from the application server to the telemetry API and confirm the supplied key has `telemetry:write` scope.
