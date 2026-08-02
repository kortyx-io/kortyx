# Run Kortyx Studio locally

This guide is for developers who already use the Kortyx SDK and want to inspect
their application's runs locally. In about five minutes, you will:

1. start Kortyx Studio;
2. connect one server-side Kortyx agent; and
3. see that agent's first run in Studio.

This preview runs Studio, the telemetry API, and Postgres through Docker
Compose. It uses one local Project, so you do not need to create an account,
Workspace, or Project before starting.

## Before you start

You need:

- Node.js 22 or newer;
- npm 10 or newer;
- Docker Engine with Docker Compose v2, or a current Docker Desktop; and
- free local ports `6300` for Studio and `6400` for the telemetry API.

Linux containers on AMD64 and ARM64 are supported. Docker Desktop on Apple
Silicon selects the ARM64 images automatically.

## 1. Start Studio

Run this from your Kortyx SDK project:

```bash
npx kortyx studio start
```

The first start can take a few minutes while Docker downloads the images.
When it is ready, the command prints:

- the Studio URL and sign-in credentials; and
- four server-side environment variables for the telemetry adapter.

The credentials and database are stored privately in `~/.kortyx/studio` and
survive restarts and `studio stop`. Do not copy the generated `.env` file into
source control.

If you need to print the values again:

```bash
npx kortyx studio credentials
```

## 2. Connect your agent

Install the optional Studio telemetry adapter:

```bash
npm install @kortyx/telemetry
```

Copy the values printed by the CLI into your application's **server-only**
environment:

```bash
KORTYX_TELEMETRY_API_URL=http://localhost:6400
KORTYX_TELEMETRY_API_KEY=ktyx_live_...
KORTYX_TELEMETRY_ENVIRONMENT=development
KORTYX_TELEMETRY_SERVICE_NAME=my-agent
```

Create one adapter and attach it to the agent:

```ts
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

The API key is a server credential. Never expose it through a browser bundle or
a public environment variable.

## 3. See your first run

1. Start your application.
2. Trigger any request that executes the Kortyx agent.
3. Open [http://localhost:6300](http://localhost:6300) and sign in with the
   credentials printed by the CLI.
4. Open **Runs**, then select the new run.

You are connected when the run appears. Studio can now show the workflow path,
model calls, timing, token usage, interrupts, and captured payloads available
for that execution.

If the run does not appear:

- confirm the API URL and key are available to the server process that creates
  the agent;
- check `npx kortyx studio status`; and
- make sure the Runs time filter includes the current time.

## Choose what content Studio may store

Studio receives structural telemetry by default, but prompt, input, and output
content is excluded. Enable only the content your application is permitted to
export:

```ts
const telemetry = createKortyxTelemetryAdapter({
  // ...connection and service options
  captureContent: { input: true, output: false },
});
```

Keep content capture off when structural timing and lifecycle data is enough.

## If your workflow uses interrupts

Studio observes interrupt lifecycle events; the application remains responsible
for presenting the request and sending the resume response.

- A pending interrupt expires with the Kortyx runtime checkpoint. The default
  TTL is 15 minutes. Configure it for the application with
  `KORTYX_FRAMEWORK_TTL_MS`, or with `frameworkAdapter.ttlMs`. This is runtime
  configuration, not a Studio Project setting.
- Studio derives **Expired** from the durable `expiresAt` timestamp. The SDK
  intentionally does not depend on an in-process timer to emit expiry.
- After expiry, the original resume token can no longer restore that run. If a
  late response reaches the application, normal application fallback may
  process it as a new run; Studio keeps the original interrupt and run expired.
- A dynamic picker can correctly show `0` embedded options. Its options are
  resolved by the client from `schemaId`; it is not an empty static choice.
- Questions and static option labels follow output-content capture. Submitted
  responses follow input-content capture. Option values and resume tokens are
  never sent as telemetry.

For implementation details, read
[Interrupts and Resume](../../apps/website/src/docs/v0/03-guides/02-interrupts-and-resume.md)
and
[Runtime Persistence Adapters](../../apps/website/src/docs/v0/04-production/02-framework-adapters.md).
Use Redis in production when paused runs must survive application restarts or
multiple instances.

## Common commands

```bash
npx kortyx studio status
npx kortyx studio logs
npx kortyx studio logs --no-follow
npx kortyx studio restart
npx kortyx studio stop
```

Starting Studio again after `stop` preserves its database and credentials.

If ports `6300` or `6400` are occupied:

```bash
npx kortyx studio start --studio-port 7300 --api-port 7400
```

The selected ports are saved. Keep using the same Studio home for later
commands.

## When you need to operate the installation

Read the [self-hosted operations guide](./self-hosted-operations.md) before you
back up, restore, upgrade, reset, or expose Studio beyond your local machine.
Read the [preview release notes](../releases/studio-self-hosted-preview.md) for
the included features and deliberate limitations.

Kortyx Studio is source-available under Elastic License 2.0. The Kortyx
framework, CLI, telemetry API, and supporting packages are Apache-2.0. See the
[license boundary](../../LICENSES.md) before redistributing Studio or offering
it as a hosted service.

Report security issues through [SECURITY.md](../../SECURITY.md), not a public
issue.
