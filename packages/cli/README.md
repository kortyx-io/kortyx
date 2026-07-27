# @kortyx/cli

[![npm version](https://img.shields.io/npm/v/@kortyx/cli.svg)](https://www.npmjs.com/package/@kortyx/cli)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/cli.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)

CLI tooling entrypoint for Kortyx projects.

The main production API surface is the `kortyx` package; this package is for project automation and developer workflow commands.

## Start Kortyx Studio locally

From any project that uses the `kortyx` SDK:

```bash
npx kortyx studio start
```

The command checks Docker, creates private local configuration under
`~/.kortyx/studio`, pulls the published API and Studio images, migrates and
bootstraps Postgres, and waits for the complete stack to become healthy. It
then prints:

- the Studio URL and generated local sign-in
- the telemetry API URL and project-scoped SDK key
- the exact environment variables to add to the server side of your app

Credentials and database data survive stop, restart, CLI upgrades, and
repeated `start` calls.

Published Studio images support `linux/amd64` and `linux/arm64`. This covers
standard Linux hosts, Apple Silicon Docker Desktop, and ARM64 Linux. Docker
selects the correct image automatically. Windows containers and other
architectures are not release-tested.

```bash
npx kortyx studio status
npx kortyx studio logs
npx kortyx studio credentials
npx kortyx studio restart
npx kortyx studio stop
```

To choose different host ports or pin a published Studio release:

```bash
npx kortyx studio start \
  --studio-port 7300 \
  --api-port 7400 \
  --image-tag v0.1.0
```

Reset is intentionally explicit because it deletes the local Studio database:

```bash
npx kortyx studio reset --confirm
```

### Connect an existing SDK project

Copy the values printed by `studio start` or `studio credentials` to a
server-only `.env.local`:

```bash
KORTYX_TELEMETRY_API_URL=http://localhost:6400
KORTYX_TELEMETRY_API_KEY=ktyx_live_...
KORTYX_TELEMETRY_ENVIRONMENT=development
KORTYX_TELEMETRY_SERVICE_NAME=my-agent
```

Install the optional HTTP telemetry adapter if the project does not already
use it:

```bash
pnpm add @kortyx/telemetry
```

Create the optional telemetry adapter once and attach it to your agent:

```ts
import { createKortyxTelemetryAdapter } from "@kortyx/telemetry";

const telemetry = createKortyxTelemetryAdapter({
  endpoint: process.env.KORTYX_TELEMETRY_API_URL!,
  apiKey: process.env.KORTYX_TELEMETRY_API_KEY!,
  environment: process.env.KORTYX_TELEMETRY_ENVIRONMENT ?? "development",
  service: {
    name: process.env.KORTYX_TELEMETRY_SERVICE_NAME ?? "my-agent",
  },
});
```

Telemetry configuration and secrets belong on the server. Do not expose the
telemetry key in browser bundles or public environment variables.

The CLI keeps local Docker lifecycle separate from future Studio administration
commands. Remote management commands will call a Studio Admin API and will
never manipulate the Studio database directly. See the
[CLI architecture](https://github.com/kortyx-io/kortyx/blob/main/docs/design-specs/kortyx-cli-architecture.md).

## Push workflow topology to Studio

Kortyx Studio should receive workflow topology as a build/deploy artifact, not only as best-effort runtime telemetry. Use `topology push` in local dev, release CI, or deployment pipelines:

```bash
kortyx topology push --entry src/lib/agent.ts
```

The entry module can export:

- `agent` from `createAgent(...)`
- `default` as an agent
- `workflows` as a workflow definition array
- named workflow definitions

Options:

```bash
kortyx topology push \
  --entry src/lib/agent.ts \
  --api-url "$KORTYX_TELEMETRY_API_URL" \
  --api-key "$KORTYX_TELEMETRY_API_KEY" \
  --environment production \
  --service-name my-app \
  --deployment-ref "$GITHUB_SHA"
```

Environment defaults:

- `KORTYX_TELEMETRY_API_URL` or `KORTYX_API_URL`
- `KORTYX_TELEMETRY_API_KEY`
- `KORTYX_TELEMETRY_ENVIRONMENT` or `NODE_ENV` or `development`
- `KORTYX_TELEMETRY_SERVICE_NAME` or nearest `package.json` name
- `KORTYX_TELEMETRY_DEPLOYMENT_REF`, `GITHUB_SHA`, or `VERCEL_GIT_COMMIT_SHA`

Check what will be sent without writing to Studio:

```bash
kortyx topology push --entry src/lib/agent.ts --dry-run
```

The API owns topology versioning. The CLI sends deterministic topology snapshots; the API creates a new workflow revision only when the topology hash changes.

## Install

Projects using `kortyx` already have the `kortyx` binary available. To install
the automation package independently:

```bash
pnpm add -D @kortyx/cli
```

```bash
npm install -g @kortyx/cli
```

## Documentation

- [Documentation](https://kortyx.io/docs)
- [Main package README](https://github.com/kortyx-io/kortyx/tree/main/packages/kortyx)
- [Monorepo](https://github.com/kortyx-io/kortyx)

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
