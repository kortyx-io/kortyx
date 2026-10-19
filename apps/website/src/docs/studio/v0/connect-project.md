---
id: "v0-studio-connect-project"
title: "Connect your application"
description: "Send workflow activity from your application server to Cloud or self-hosted Studio, then verify that a real request appears."
keywords: ["kortyx", "studio", "connect", "project"]
sidebar_label: "Connect your application"
section: "get-started"
---
# Connect your application

You need a working Kortyx agent and a project write key. Get the key from [Cloud Settings](/docs/cloud/get-started) or your [local installation](/docs/self-hosting/run-locally). The SDK defaults to `https://api.kortyx.io` for Cloud. For a team installation, ask its operator for the telemetry API endpoint and application write key.

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

For Cloud, copy the project write key from **Settings > API keys**. You do not need to configure an endpoint. For local Studio, run `kortyx studio credentials --format dotenv --service-name my-agent`; self-hosted applications also need the telemetry API endpoint supplied by their operator.

Store the supplied values in your application's private server environment:

```dotenv file=".env.local"
KORTYX_TELEMETRY_API_KEY=<your project write key>
KORTYX_TELEMETRY_ENVIRONMENT=development
KORTYX_TELEMETRY_SERVICE_NAME=my-agent
```

For local or self-hosted Studio, also set `KORTYX_TELEMETRY_API_URL` to its reachable telemetry API base URL, such as `http://localhost:6400`.

Load those values with your server's existing environment loader. Use a stable service name across deployments. The environment is an activity label; it does not create a project or an access boundary. Keep the key out of browser code and public environment prefixes.

## Attach telemetry to the agent

```ts tabs="connect-studio-agent" tab="TypeScript" file="src/lib/agent.ts"
import { createAgent } from "kortyx";
import { createKortyxTelemetryAdapter } from "@kortyx/telemetry";
import { workflows } from "./workflows";

const telemetry = createKortyxTelemetryAdapter({
  endpoint: process.env.KORTYX_TELEMETRY_API_URL,
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

The optional `endpoint` above allows self-hosted overrides. Cloud applications can omit the property entirely. The adapter does not read environment variables itself. Upgrade `@kortyx/telemetry` before removing an endpoint from a configuration using an older version that required it.

Keep the service name stable across deploys. Use the environment field as an informative label; it does not create a separate security or storage boundary.

## Verify the connection

Open **Workflows** after the topology push, then trigger one agent request and
open **Runs** in Studio. If nothing arrives, use this order:

1. Confirm the application server loaded its project key, environment, and service name. Self-hosted installations also need the correct endpoint; Cloud uses the SDK default.
2. Confirm it restarted after configuration changed.
3. Confirm `topology push` used the entry module and service name for this app.
4. For self-hosted Studio, check the stack with `npx kortyx studio status`. For Cloud, check the selected organization and project.
5. Inspect application delivery failures. For local Studio, also inspect `npx kortyx studio logs --no-follow`.
6. Confirm the Studio time filter includes the event.

For remote deployments, also verify network reachability from the application server to the telemetry API and confirm the supplied key has `telemetry:write` scope.

When your request appears in **Runs**, continue with [Explore your first run](/docs/studio/first-run).

After upgrading the SDK and CLI, rebuild your application and republish its source
catalog. Source-discovered links should remain visible after a request executes
the production bundle, including links that request did not exercise. The topology
identity correction can create one new revision for workflows with inferred
handoffs; historical runs remain readable and no database migration is needed.

> **Good to know:** Seeing a run without its prompt text is a successful connection. [Run inspection](/docs/studio/runs#captured-content) shows structural activity even when content is excluded; [troubleshooting](/docs/studio/troubleshooting#inputs-or-outputs-are-missing) explains missing payloads.

## Choose what content Studio may store

Structural telemetry is useful without storing prompts or responses. Input and output content are excluded by default.

Enable only the content your application is permitted to export:

```ts tabs="studio-content-capture" tab="TypeScript" file="src/lib/agent.ts"
const telemetry = createKortyxTelemetryAdapter({
  endpoint: process.env.KORTYX_TELEMETRY_API_URL,
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

## Continue

[Publish the workflow map](/docs/cli/topology) to see declared paths before they run. Add [response feedback](/docs/studio/feedback) when your application can accept ratings through its authenticated backend.
