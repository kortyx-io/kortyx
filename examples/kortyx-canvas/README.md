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

Open Studio at `http://localhost:6300` with `admin` / `kortyx`. The Workflows
view shows the published catalog without creating synthetic runs. Configure
`GOOGLE_API_KEY` and complete a real canvas chat request to verify run
telemetry in the Runs view.


### Studio workflow layout examples

The local-only scripts in `scripts/studio-example-workflows.mjs` and
`scripts/studio-workflow-examples.mjs` publish seven workflow topologies and run
thirteen deterministic scenarios through the real Kortyx runtime and telemetry
adapter. No model credentials are needed. The chat-fork example reproduces the
`hiring-monster@1.2.0` topology with deterministic node implementations.

After starting the repository development stack with `pnpm dev`, run from the
repository root:

```sh
pnpm exec dotenv -e .env -- node packages/kortyx/dist/cli.js topology push --entry examples/kortyx-canvas/scripts/studio-example-workflows.mjs
pnpm exec dotenv -e .env -- pnpm --filter @kortyx/example-canvas exec node scripts/studio-workflow-examples.mjs
```

Open Studio's Workflows page with **All time**, search `studio-example`, and
select a workflow. Collapse the catalog and inspector to inspect a larger map.
The cases cover linear execution, parallel branches with separate terminal
nodes, three alternative exits, a three-way parallel join, a sequential retry
loop, a conditional edge directly to End, and a larger parallel/conditional flow.
Every terminal edge connects to the workflow's shared End marker. Start and End
are visual boundaries with no execution metrics or node inspector.

The loop example is sequential: the runtime does not support back-edges in
parallel graphs. Re-running the script adds another set of runs to the local
project. The runner refuses non-loopback telemetry destinations.

### Child workflow regression

The chat node uses `useWorkflow` to call creation, brief lookup, update, and
save workflows, then returns their validated data. The update fallback calls
the save workflow as a nested child. Calls use the same definitions registered
in `src/lib/agent.ts`; the definitions supply input/output schemas.

Run `pnpm --filter @kortyx/example-canvas test` for the deterministic save
confirmation/fork regression. For the runtime's nested interrupt, concurrent
resume, rollback, and fork tests against Redis:

```sh
KORTYX_TEST_REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @kortyx/agent exec vitest run test/child-workflows.test.ts
```

To verify manually, ask the chat to create a canvas and choose the brief and
facilitator. Fork while the brief picker is open; choose different briefs in
the two chats. Both must resume independently, stream their own canvas, and
finish the parent. With Redis configured, restart the server while one chat
is at the facilitator picker and complete it after restart.

The brief and facilitator pickers are also the live example for model-driven
interrupt contracts. One `useReason` call receives both `briefPicker` and
`agentPicker`; the model chooses the appropriate contract, the Canvas picker
submits a structured response value, and the same reasoning operation resumes.
To exercise it directly, ask “Tell me about the brief” (generic brief picker)
or “Create a canvas” (brief and facilitator pickers).

### Handoff and child calls in the same map

Send `/help` in Canvas chat to run a deterministic, model-free handoff:
`general-chat/chat` returns `transitionTo: WORKFLOW_IDS.canvasHelp`, and
`canvas-help/showHelp` displays the help message and ends the turn. Execution
does not return to the chat node. The next user message starts at general-chat.

Publish the catalog with `topology:push`, then open Studio’s Workflows page.
All five child-call relationships remain visible in purple (dotted, call +
return). The help handoff appears in blue (dashed, `transitionTo`). The legend
explains both, and selecting either connection opens its inspector. Sending
`/help` records a real handoff; no model key or interrupt is needed.
