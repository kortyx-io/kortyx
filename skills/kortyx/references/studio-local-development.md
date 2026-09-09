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
`http://localhost:4200` (or the configured `KORTYX_CANVAS_PORT`).

Publish the Canvas catalog through its repository script:

```bash
pnpm --filter @kortyx/example-canvas topology:push
```

Then send a real Canvas request. Do not add or invoke a synthetic smoke workflow
to make Studio look connected.

## Child Workflow Visibility

Register parent and child definitions in the catalog. Calls inside custom hooks are observed at runtime; no topology declaration is required. In **Runs**, enable **Include child workflows** to search individual calls, then open a child row to its parent execution's **Execution** tab. This view shows nested calls, node/generation ownership, lifecycle, captured input/returned data, and branch selection. Child rows do not increase session root-run counts.

Use **Observed calls** on the workflow canvas to display dotted purple call/return links. Click a link to open a concrete call. Handoff relationships remain separate. Publish the catalog before running real application traffic; an absent observed link means no call was captured in the selected cohort.

For fork/rollback testing, compare `(runId, branchId, invocationId)`, not invocation ID alone. Restored calls reference source evidence, completed results can be reused without new execution, and leaf human interrupts link back to the call tree. Input/output capture is opt-in; oversized child payloads are omitted with a marker. Old SDK generic spans cannot establish logical completion.

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
