---
id: "v0-cli-topology"
title: "Publish a workflow map"
description: "Publish source-discovered workflow paths to Cloud or self-hosted Studio using your application entry and telemetry write key."
keywords: ["kortyx", "cli", "topology"]
sidebar_label: "Publish a workflow map"
section: "application-commands"
---
# Publish a workflow map

Run this command from your application project with its telemetry endpoint and write key loaded in the server environment. In Cloud, copy the values from **Settings > Connection**. For a local installation, use its generated SDK configuration.

## Publish a workflow catalog

Catalog publication is a top-level Kortyx command rather than a Studio
lifecycle command:

```bash
npx kortyx topology push --entry src/lib/agent.ts
```

It publishes declared workflow topology before traffic arrives without
creating runs. Use `--dry-run` to inspect the projection locally. See [Connect your application](/docs/studio/connect-project) for the complete connection flow.

The CLI imports the application entry module and calls the telemetry API with its write key. Publication runs in your application's deployment environment; deploying Studio does not publish catalogs for your applications.

## Verify publication

Open **Workflows** in the intended Studio project and inspect the declared map. A published map can exist before any run has used its paths. Send a real application request to add execution evidence.

## Publish the declared workflow catalog

> **Good to know:** Publish topology for each application release, ideally before that version serves traffic, using the same server-only telemetry variables as the app. A private API needs a network-connected runner or an application-image job/task in the allowed network; a public GitHub runner can launch that job without reaching the API itself. The [AWS ECS task pattern](/docs/self-hosting/deploy-aws-cdk#publish-topology-from-the-application-release) shows this setup.

Publish deterministic topology from the module that exports your configured
agent or workflows:

```bash
npx kortyx topology push --entry src/lib/agent.ts
```

Use `--dry-run` to inspect the projection without writing to Studio:

```bash
npx kortyx topology push --entry src/lib/agent.ts --dry-run
```

The published catalog appears under **Workflows** before traffic arrives. This
does not create a run. **Runs** contains only real workflow executions emitted
by your application. Keep runtime topology registration enabled as a
best-effort fallback, but use `topology push` as the canonical deployment step.

For a release container, keep a small catalog module in the application repository that exports the same workflow definitions without starting the server or connecting to application persistence:

```ts file="src/catalog.ts"
export { workflows } from "./workflows.js";
```

```js file="src/catalog.js"
export { workflows } from "./workflows.js";
```

Build and include it in the application artifact. If the compiled path is `dist/catalog.js`, run the installed CLI from the application directory:

```bash
./node_modules/.bin/kortyx topology push --entry dist/catalog.js
```

Use the exact application version being released, keep the service name and environment aligned with runtime telemetry, and check the command's exit code before marking publication successful. Topology publication targets the telemetry API, not the Studio browser interface. It is separate from deploying Studio or running its database bootstrap.

Next: [Explore the workflow map](/docs/studio/workflows) or [inspect your first real run](/docs/studio/first-run).
