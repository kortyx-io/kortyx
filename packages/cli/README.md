# @kortyx/cli

[![npm version](https://img.shields.io/npm/v/@kortyx/cli.svg)](https://www.npmjs.com/package/@kortyx/cli)
[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@kortyx/cli.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)

CLI tooling entrypoint for Kortyx projects.

The main production API surface is the `kortyx` package; this package is for project automation and developer workflow commands.

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
