# Studio Local Development

Use this reference when the task is to launch Kortyx Studio locally, connect an
SDK application, publish its workflow catalog, or diagnose why Studio is empty.

## Mental Model

- Studio observes Kortyx applications; it does not execute their workflows.
- The local CLI starts Studio, the telemetry API, and PostgreSQL in Docker.
- **Workflows** shows the declared catalog. **Runs** shows actual executions.
- Publishing a catalog must not create a fake workflow or run.

## Consumer Project Flow

1. Confirm Docker is running, then start or reuse the local stack:

   ```bash
   npx kortyx studio start
   ```

2. Print copyable SDK variables with a stable service name:

   ```bash
   npx kortyx studio credentials --format dotenv --service-name my-agent
   ```

3. Put the four `KORTYX_TELEMETRY_*` values in the application's server-only
   environment. Never use `NEXT_PUBLIC_`, `VITE_`, or another public prefix.

4. Install `@kortyx/telemetry`, create one
   `createKortyxTelemetryAdapter(...)`, and attach it where the server creates
   the agent. Follow the current official guide at
   `https://kortyx.io/docs/studio/connect-project` for the adapter shape and
   content-capture policy.

5. Publish topology from the module exporting the agent, workflows array, or
   workflow definitions:

   ```bash
   npx kortyx topology push --entry src/lib/agent.ts
   ```

   Use `--dry-run` first when the entry/export is uncertain. `topology push` is
   the canonical pre-traffic catalog path; runtime registration remains a
   best-effort fallback for real executions.

6. Restart the app, send a real request that runs the agent, and inspect Studio.
   Confirm the catalog in **Workflows** and the execution in **Runs**.

## Kortyx Repository Flow

From the repository root:

```bash
pnpm install
pnpm dev
```

This prepares workspace packages and starts PostgreSQL, the API, Studio, and the
Canvas example. By default Studio is at `http://localhost:6300` and Canvas is at
`http://localhost:3002`.

Publish the Canvas catalog through its repository script:

```bash
pnpm --filter @kortyx/example-canvas topology:push
```

Then send a real Canvas request. Do not add or invoke a synthetic smoke workflow
to make Studio look connected.

## Troubleshooting Order

1. Run `npx kortyx studio status`.
2. Run `npx kortyx studio logs --no-follow`.
3. Reprint credentials and compare the API URL/key with the server process.
4. Confirm the app restarted after environment changes.
5. Dry-run and then publish the correct agent entry.
6. Check **Workflows** for the catalog and **Runs** for a real execution; do not
   expect catalog publication alone to create a run.

Use `npx kortyx studio credentials` for browser sign-in details. Treat every
printed telemetry key as a secret.
